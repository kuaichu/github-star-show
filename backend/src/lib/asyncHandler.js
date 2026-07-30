import { Router } from "express";

export function asyncHandler(handler) {
  return function expressAsyncHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function createAsyncRouter() {
  const router = Router();
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(
      path,
      ...handlers.map(handler => asyncHandler(handler))
    );
  }
  return router;
}
