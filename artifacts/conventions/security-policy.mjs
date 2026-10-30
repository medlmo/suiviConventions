const FRONTEND_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
];

export function createFrontendCsp(
  connectSources = "'self'",
  includeFrameAncestors = false,
  allowInlineScripts = false,
) {
  const scriptSource = `script-src 'self'${allowInlineScripts ? " 'unsafe-inline'" : ""}`;
  const directives = [
    ...FRONTEND_DIRECTIVES,
    scriptSource,
    `connect-src ${connectSources}`,
  ];
  if (includeFrameAncestors) directives.push("frame-ancestors 'none'");
  return directives.join("; ");
}
