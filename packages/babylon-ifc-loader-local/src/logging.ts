export interface LogContext {
  modelID?: number;
  expressID?: number;
  geometryExpressID?: number;
}

function formatContext(context?: LogContext): string {
  if (!context) {
    return "";
  }

  const contextParts: string[] = [];
  if (context.modelID !== undefined) {
    contextParts.push(`modelID=${context.modelID}`);
  }
  if (context.expressID !== undefined) {
    contextParts.push(`expressID=${context.expressID}`);
  }
  if (context.geometryExpressID !== undefined) {
    contextParts.push(`geometryExpressID=${context.geometryExpressID}`);
  }

  return contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";
}

function withContext(message: string, context?: LogContext): string {
  return `${message}${formatContext(context)}`;
}

export function logInfo(message: string, context?: LogContext): void {
  console.log(withContext(message, context));
}

export function logWarn(message: string, context?: LogContext, detail?: unknown): void {
  const text = withContext(message, context);
  if (detail !== undefined) {
    console.warn(text, detail);
    return;
  }
  console.warn(text);
}

export function logError(message: string, context?: LogContext, detail?: unknown): void {
  const text = withContext(message, context);
  if (detail !== undefined) {
    console.error(text, detail);
    return;
  }
  console.error(text);
}

