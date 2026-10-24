import { ThemeToggle } from "@/components/theme-toggle";

// Placeholder until the sign-in screen lands later in Phase 2.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 pb-24">
        <h1 className="text-6xl font-medium tracking-tight">Dites</h1>
        <p className="text-lg text-muted-foreground">
          A public, realtime chat. Sign-in and rooms are on the way.
        </p>
      </section>
    </main>
  );
}
