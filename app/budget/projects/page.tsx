import BudgetProjectsReadOnlyClient from "@/components/budget/projects/BudgetProjectsReadOnlyClient";

export default function BudgetProjectsPage() {
  return (
    <main
      style={{
        minHeight: "100%",
        width: "100%",
        minWidth: 0,
        padding: "clamp(10px, 1.6vw, 20px)",
        background: "#f8fafc",
        overflowX: "clip",
      }}
    >
      <div
        style={{
          width: "100%",
          minWidth: 0,
          maxWidth: "none",
          margin: "0 auto",
        }}
      >
        <BudgetProjectsReadOnlyClient />
      </div>
    </main>
  );
}
