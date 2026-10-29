export default {
  test: { environment: 'jsdom', include: ['tests/reboot/dashboard/agent_chat.test.tsx'] },
  esbuild: { jsx: 'automatic' },
};
