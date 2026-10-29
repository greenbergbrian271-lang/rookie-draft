// Lets plain Node run the TypeScript lib files in unit tests: resolves extensionless relative imports to .ts.
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) { if (specifier.startsWith(".") && !/\\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context); throw error; }
}`), import.meta.url);
