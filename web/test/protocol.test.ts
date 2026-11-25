// The protocol module against golden vectors exported from the Rust reference
// implementation (rust/hedgewars-network-protocol, src/tests/golden.rs).
import { describe, expect, it } from 'vitest';
import {
  clientToRaw,
  MessageReader,
  parseServerMessage,
  ProtocolError,
  type ClientMessage,
  type ServerMessage,
} from '../src/lib/protocol/messages';
import goldenJson from './protocol-golden.json';

const golden = goldenJson as unknown as {
  client: { msg: ClientMessage; raw: string }[];
  server: { msg: ServerMessage; raw: string }[];
};

describe('client messages', () => {
  it.each(golden.client.map((g) => [g.msg.type, g] as const))(
    '%s serialises like the reference',
    (_, g) => {
      expect(clientToRaw(g.msg)).toBe(g.raw);
    },
  );
});

describe('server messages', () => {
  it.each(golden.server.map((g) => [g.msg.type, g] as const))(
    '%s parses like the reference',
    (_, g) => {
      expect(parseServerMessage(g.raw)).toEqual(g.msg);
    },
  );

  it('rejects unknown and malformed messages', () => {
    expect(() => parseServerMessage('NO_SUCH_THING\n\n')).toThrow(ProtocolError);
    expect(() => parseServerMessage('PROTO\nabc\n\n')).toThrow(ProtocolError);
    expect(() => parseServerMessage('LEFT\n\n')).toThrow(ProtocolError);
    expect(() => parseServerMessage('ROOM_CONTROL_ACCESS\n256\n\n')).toThrow(ProtocolError);
  });

  it('reads an empty last text argument (it merges with the terminator on the wire)', () => {
    // the server sends LEFT nick "" as "LEFT\nbob\n\n\n"
    const reader = new MessageReader();
    const raws = reader.feed('LEFT\nbob\n\n\nLOBBY:LEFT\nbob\n\n\nCHAT\nbob\n\n\nBYE\n\n');
    expect(raws.map(parseServerMessage)).toEqual([
      { type: 'RoomLeft', args: ['bob', ''] },
      { type: 'LobbyLeft', args: ['bob', ''] },
      { type: 'ChatMsg', args: ['bob', ''] },
      { type: 'Bye', args: [''] },
    ]);
  });
});

describe('MessageReader', () => {
  it('splits a stream into messages regardless of chunking', () => {
    const stream = golden.server.map((g) => g.raw).join('');
    const expected = golden.server.map((g) => g.raw);
    for (const chunkSize of [1, 3, 7, 64, stream.length]) {
      const reader = new MessageReader();
      const got: string[] = [];
      for (let i = 0; i < stream.length; i += chunkSize)
        got.push(...reader.feed(stream.slice(i, i + chunkSize)));
      expect(got).toEqual(expected);
    }
  });

  it('skips leading empty lines', () => {
    expect(new MessageReader().feed('\n\nPING\n\n\nPONG\n\n')).toEqual(['PING\n\n', 'PONG\n\n']);
  });
});
