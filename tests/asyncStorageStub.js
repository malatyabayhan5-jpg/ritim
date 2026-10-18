const mem = {};
export default {
  getItem: async (k) => (k in mem ? mem[k] : null),
  setItem: async (k, v) => { mem[k] = v; },
};
