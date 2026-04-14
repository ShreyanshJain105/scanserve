import type { Response } from "express";
import type { ApiResponse } from "../shared";

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200) => {
  const payload: ApiResponse<T> = { status: 1, data };
  return res.status(statusCode).json(payload);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 400,
  code?: string
) => {
  const payload: ApiResponse = { status: 0, error: { message, code } };
  return res.status(statusCode).json(payload);
};
