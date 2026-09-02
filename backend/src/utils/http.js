/** Small request/response helpers shared by controllers. */

/** Validated query params (set by the validate middleware), falling back to raw. */
export const getQuery = (req) => req.validatedQuery ?? req.query ?? {};

/** Uniform success envelope: { success, data, ...extra }. */
export const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });

export const created = (res, data, extra = {}) =>
  res.status(201).json({ success: true, data, ...extra });

/** Paginated list envelope. */
export const paginated = (res, items, { page, limit, total }) =>
  res.json({
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: page * limit < total,
    },
  });

export default { getQuery, ok, created, paginated };
