const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const errorHandler = (err, req, res, next) => {
  console.error(err);
  if (err.name === 'SequelizeValidationError') {
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.errors.map((e) => e.message) },
    });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: { code: 'DUPLICATE', message: 'Record already exists' },
    });
  }
  const status = err.status || 500;
  res.status(status).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
  });
};

const notFound = (req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });

module.exports = { asyncHandler, errorHandler, notFound };
