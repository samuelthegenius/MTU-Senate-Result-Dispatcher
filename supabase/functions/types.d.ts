// Type declarations for Deno Edge Functions
// These provide TypeScript support for Deno globals in VS Code

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

declare const Request: {
  prototype: Request;
  new (input: RequestInfo | URL, init?: RequestInit): Request;
};

interface Request extends globalThis.Request {}

declare const Response: {
  prototype: Response;
  new (body?: BodyInit | null, init?: ResponseInit): Response;
};

interface Response extends globalThis.Response {}

declare const fetch: typeof globalThis.fetch;
declare const console: typeof globalThis.console;
declare const File: typeof globalThis.File;
declare const FormData: typeof globalThis.FormData;
declare const Blob: typeof globalThis.Blob;
declare const btoa: typeof globalThis.btoa;
