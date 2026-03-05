export class UnknownError extends Error {
  constructor(message?: any) {
    super(String(message));

    this.name = "UnknownError";
  }
}

export const ensureError = (error: any) => {
  if (error instanceof Error) {
    return error;
  } else {
    return new UnknownError(error);
  }
};
