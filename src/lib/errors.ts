/** Input the user can fix. The message is safe to show. */
export class ValidationError extends Error {
  override name = "ValidationError";
}
/** The signed-in user may not do this. */
export class ForbiddenError extends Error {
  override name = "ForbiddenError";
  constructor(message = "You are not allowed to do that") {
    super(message);
  }
}
export class NotFoundError extends Error {
  override name = "NotFoundError";
  constructor(message = "Not found") {
    super(message);
  }
}
