import fs from 'node:fs';
import { VoiceUnavailable, EmptySpeech } from './engine.js';

const FILE_RE = /^([a-f0-9]{64})\.wav$/;

function sendVoiceError(reply, err) {
  if (err instanceof EmptySpeech) return reply.code(400).send({ error: 'empty_text' });
  if (err instanceof VoiceUnavailable) return reply.code(503).send({ error: err.message === 'voice_busy' ? 'voice_busy' : 'voice_unavailable' });
  return null;
}

/**
 * Olaf's server-side voice. All routes sit behind device auth (the global
 * onRequest hook); /audio also accepts ?token= for players that cannot set
 * headers.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{voice: ReturnType<typeof import('./engine.js').createVoiceEngine>}} ctx
 */
export function registerVoiceRoutes(app, { voice }) {
  app.get('/v1/voice/status', async () => voice.status());

  app.post(
    '/v1/voice/speak',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: { text: { type: 'string', minLength: 1, maxLength: 2000 } },
        },
      },
    },
    async (request, reply) => {
      if (!voice.enabled) return reply.code(503).send({ error: 'voice_unavailable' });
      try {
        const { id, url, durationMs, cached } = await voice.speak(request.body.text);
        return { id, url, durationMs, cached };
      } catch (err) {
        if (sendVoiceError(reply, err)) return reply;
        request.log.error({ err }, 'voice speak failed');
        return reply.code(500).send({ error: 'internal_error' });
      }
    },
  );

  app.get('/v1/voice/audio/:file', async (request, reply) => {
    const match = FILE_RE.exec(request.params.file);
    if (!match) return reply.code(404).send({ error: 'not_found' });

    let file;
    try {
      file = await voice.fileFor(match[1]);
    } catch (err) {
      if (sendVoiceError(reply, err)) return reply;
      request.log.error({ err }, 'voice audio failed');
      return reply.code(500).send({ error: 'internal_error' });
    }
    if (!file) return reply.code(404).send({ error: 'not_found' });

    // Content-addressed: the bytes behind an id never change.
    reply.header('Content-Type', 'audio/wav');
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.header('ETag', `"${match[1]}"`);
    reply.header('Accept-Ranges', 'bytes');

    if (request.headers['if-none-match'] === `"${match[1]}"`) return reply.code(304).send();

    // AVPlayer (iOS) insists on byte ranges for HTTP media.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
    if (range && (range[1] || range[2])) {
      let start;
      let end;
      if (range[1]) {
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
      } else {
        start = Math.max(0, file.size - Number(range[2]));
        end = file.size - 1;
      }
      if (start > end || start >= file.size) {
        reply.header('Content-Range', `bytes */${file.size}`);
        return reply.code(416).send();
      }
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${file.size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(fs.createReadStream(file.path, { start, end }));
    }

    reply.header('Content-Length', file.size);
    return reply.send(fs.createReadStream(file.path));
  });
}
