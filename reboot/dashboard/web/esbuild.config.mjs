// `minifySyntax` drops the `if (false) { throw new Error("^_^") }`
// branch `define` leaves in react-dom's `checkDCE`; React DevTools
// throws on a production build whose `checkDCE` contains `^_^`.
export default {
  minifySyntax: true,
};
