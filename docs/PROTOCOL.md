# Live transport

The UI connects to `/api/live?spectrum=0&format=spectrum-v1` using WebSocket. State snapshots, metadata, profile changes, audio status and subscription commands use JSON. Spectrum subscriptions can change on the existing connection with `{"type":"spectrum","enabled":true}` or `false`.

Clients requesting `format=spectrum-v1` receive compatible spectrum frames as binary WebSocket messages. Clients omitting the parameter continue receiving JSON envelopes. The browser accepts both formats, including JSON from an older server. Each spectrum frame is independent and sent immediately; encoding adds no batching, delta-frame dependency or smoothing.

## Spectrum v1

The application payload is exactly 91 bytes. Multi-byte numeric fields and band bits use little-endian order.

| Offset | Size | Content |
| --- | --- | --- |
| 0 | 2 | Magic bytes `4e 50` (`NP`). |
| 2 | 1 | Protocol version `1`. |
| 3 | 1 | Message type `1` (spectrum). |
| 4 | 8 | `generatedAt`: IEEE 754 double, Unix milliseconds. |
| 12 | 8 | `at`: IEEE 754 double, server receipt time in Unix milliseconds. |
| 20 | 8 | `rms`: IEEE 754 double. |
| 28 | 8 | `peak`: IEEE 754 double. |
| 36 | 55 | 44 band levels, ten bits per level, least significant bits first. |

Band values are integers from 0 to 1000, decoded by dividing by 1000. This exactly preserves the native bridge's existing three-decimal output. Values from another producer that do not fit this precision use a JSON spectrum envelope instead; the encoder never rounds away extra input precision. RMS and peak values retain their full JavaScript number precision, and millisecond timestamps are exact safe integers. Missing producer timestamps on silence/status frames use the server timestamp.

The decoder rejects unknown versions/types, unexpected payload lengths, invalid meters/timestamps and band codes above 1000. WebSocket framing adds two bytes to this payload; TCP/IP overhead is separate. The original JSON shape remains `{ "stream": "spectrum", "event": "spectrum", "data": { "bands": [], "rms": 0, "peak": 0, "generatedAt": 0, "at": 0 } }`.
