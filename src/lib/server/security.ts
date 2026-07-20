export function hasValidRequestOrigin(request: Request, target: URL): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  return origin === target.origin;
}
