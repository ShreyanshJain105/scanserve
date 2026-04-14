import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async route handler so that rejected promises
 * are forwarded to Express's error middleware instead of
 * crashing the process with an unhandled rejection.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
