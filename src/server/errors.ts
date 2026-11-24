/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(message: string, public code: string = "BAD_REQUEST", public field?: string) {
    super(message);
    this.name = "AppError";
  }
}
export const fail = (message: string, code = "BAD_REQUEST", field?: string): never => { throw new AppError(message, code, field); };
export const notFound = (what: string): never => { throw new AppError(`${what} not found`, "NOT_FOUND"); };
export const forbidden = (message = "You do not have permission to do this"): never => { throw new AppError(message, "FORBIDDEN"); };
