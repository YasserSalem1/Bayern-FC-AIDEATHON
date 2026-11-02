/** Vite middleware that exposes /api/* and proxies Gemini calls server-side. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import type { ChatMessage, ChatState, DecisionRequest } from '../src/gemini/types.ts';
import { chatAnswer, generateDecisions, readEnv, type GeminiEnv } from './gemini.ts';

const MAX_BODY = 256 * 1024;

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function createApiHandler(env: GeminiEnv): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/')) return next();
    try {
      if (req.method === 'GET' && url === '/api/status') return send(res, 200, { live: !!env.apiKey, model: env.model });
      if (!env.apiKey) return send(res, 503, { error: 'No GEMINI_API_KEY configured' });
      if (req.method === 'POST' && url === '/api/decisions') {
        const body = await readJson<DecisionRequest>(req);
        if (!Array.isArray(body?.blocks)) return send(res, 400, { error: 'blocks missing' });
        return send(res, 200, { decisions: await generateDecisions(env, body), model: env.model });
      }
      if (req.method === 'POST' && url === '/api/chat') {
        const body = await readJson<{ question: string; state: ChatState; history?: ChatMessage[] }>(req);
        const question = String(body?.question ?? '').slice(0, 500);
        if (!question || !body.state) return send(res, 400, { error: 'question and state required' });
        return send(res, 200, { answer: await chatAnswer(env, question, body.state, body.history ?? []) });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      // Logged server-side only; the client falls back to cached/rule-based answers.
      console.warn('[gemini]', (e as Error).message);
      return send(res, 502, { error: (e as Error).message });
    }
  };
}

export function geminiApiPlugin(rawEnv: Record<string, string | undefined>): Plugin {
  const env = readEnv(rawEnv);
  return {
    name: 'third-half-gemini-api',
    configureServer(server) {
      server.middlewares.use(createApiHandler(env));
      server.httpServer?.once('listening', () =>
        server.config.logger.info(
          `  Gemini: ${env.apiKey ? `live (${env.model})` : 'no GEMINI_API_KEY → cached/offline mode'}`,
        ),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiHandler(env));
    },
  };
}
