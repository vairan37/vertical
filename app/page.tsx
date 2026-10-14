import Creator from "./creator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 pb-12">
      <h1 className="mb-6 text-2xl font-bold">Nouvelle vidéo</h1>
      <Creator />
    </main>
  );
}
