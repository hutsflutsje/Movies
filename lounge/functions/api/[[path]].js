// Any /api/* route that doesn't exist returns JSON instead of the website's HTML.
import { fail } from '../_lib/util.js';

export function onRequest() {
  return fail('Unknown API route', 404);
}
