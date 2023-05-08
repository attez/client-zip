import "./polyfills.ts"
import { BufferLike, StreamLike, normalizeInput, ReadableFromIter } from "./input.ts"
import { normalizeMetadata } from "./metadata.ts"
import { loadFiles, contentLength } from "./zip.ts"

/** The file name, modification date and size will be read from the input;
 * extra arguments can be given to override the input’s metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?: any, lastModified?: any, size?: number }

/** Intrinsic size, but the file name must be provided and modification date can’t be guessed. */
type InputWithSizeMeta = { input: BufferLike, name: any, lastModified?: any, size?: number }

/** The file name must be provided ; modification date and content length can’t be guessed. */
type InputWithoutMeta = { input: StreamLike, name: any, lastModified?: any, size?: number }

/** Both filename and size must be provided ; input is not helpful here. */
type JustMeta = { input?: StreamLike | undefined, name: any, lastModified?: any, size: number }

type ForAwaitable<T> = AsyncIterable<T> | Iterable<T>

export type Options = {
  /** If provided, the returned Response will have its `Content-Length` header set to this value.
   * It can be computed accurately with the `predictLength` function. */
  length?: number
  /** If provided, the returned Response will have its `Content-Length` header set to the result of
   * calling `predictLength` on that metadata. Overrides the `length` option. */
  metadata?: Iterable<InputWithMeta | InputWithSizeMeta | JustMeta>
  /** The ZIP *language encoding flag* will always be set when a filename was given as a string,
   * but when it is given as an ArrayView or ArrayBuffer, it depends on this option :
   * - `true`: always on (ArrayBuffers will *always* be flagged as UTF-8) — recommended,
   * - `false`: always off (ArrayBuffers will *never* be flagged as UTF-8),
   * - `undefined`: each ArrayBuffer will be tested and flagged if it is valid UTF-8. */
  buffersAreUTF8?: boolean
}

function normalizeArgs(file: InputWithMeta | InputWithSizeMeta | InputWithoutMeta | JustMeta) {
  return file instanceof File || file instanceof Response
    ? [[file], [file]] as const
    : [[file.input, file.name, file.size], [file.input, file.lastModified]] as const
}

function* mapMeta(files: Iterable<InputWithMeta | InputWithSizeMeta | JustMeta>) {
  // @ts-ignore type inference isn't good enough for this… yet…
  // but rewriting the code to be more explicit would make it longer
  for (const file of files) yield normalizeMetadata(...normalizeArgs(file)[0])
}

async function* mapFiles(files: ForAwaitable<InputWithMeta | InputWithSizeMeta | InputWithoutMeta>) {
  for await (const file of files) {
    const [metaArgs, dataArgs] = normalizeArgs(file)
    // @ts-ignore type inference isn't good enough for this… yet…
    // but rewriting the code to be more explicit would make it longer
    yield Object.assign(normalizeInput(...dataArgs), normalizeMetadata(...metaArgs))
  }
}

/** Given an iterable of file metadata (or equivalent),
 * @returns the exact byte length of the Zip file that would be generated by `downloadZip`. */
export const predictLength = (files: Iterable<InputWithMeta | InputWithSizeMeta | JustMeta>) => contentLength(mapMeta(files))

export function downloadZip(files: ForAwaitable<InputWithMeta | InputWithSizeMeta | InputWithoutMeta>, options: Options = {}) {
  const headers: Record<string, any> = { "Content-Type": "application/zip", "Content-Disposition": "attachment" }
  if (Number.isInteger(options.length) && options.length! > 0) headers["Content-Length"] = options.length
  if (options.metadata) headers["Content-Length"] = predictLength(options.metadata)
  return new Response(ReadableFromIter(loadFiles(mapFiles(files), options)), { headers })
}
