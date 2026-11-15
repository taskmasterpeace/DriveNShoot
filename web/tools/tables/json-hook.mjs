// Lets plain node import the game's modules that Vite lets import .json without an attribute.
// Use: node --import ./tools/tables/register-json.mjs <script>
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.json')) return next(specifier, { ...context, importAttributes: { type: 'json' } });
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' }, format: 'json' });
  return next(url, context);
}
