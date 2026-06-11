import { NextFunction, Request, Response } from 'express';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Reddedilen promise'lerin error middleware'ine iletilmesi için async route'u sarmalar.
export const asyncHandler = (fn: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
