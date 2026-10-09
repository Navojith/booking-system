import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => <main className="p-8 text-xl">Kenora Workshops</main>,
});
