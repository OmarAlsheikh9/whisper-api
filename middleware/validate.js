export const validate = (schema) => (req, res, next) => {
  // TODO:
  // Hint: schema.safeParse(req.body). On failure: 400 with { error: { message, details } }.
  // On success: replace req.body with result.data and call next().

  const result = schema.safeParse(req.body);

  if (!result.success) {

    const details = result.error.errors.map((problem) => ({
      field: problem.path.join('.'), 
      message: problem.message,     
    }));

    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details, 
      },
    });
  }

  req.body = result.data;

  next(); 
};