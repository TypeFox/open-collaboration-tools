import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { OpenCollaborationYjsProvider } from "open-collaboration-yjs";

export class MonacoOCTYjsProvider extends OpenCollaborationYjsProvider {

    protected override encodeBase64(encoder: encoding.Encoder): string {
        return btoa(String.fromCharCode.apply(encoding.toUint8Array(encoder)));
    }

    protected override decodeBase64(data: string): decoding.Decoder {
        const encoder = new TextEncoder();
        return decoding.createDecoder(encoder.encode(atob(data)));
    }
}