import BudgetProjectsReadOnlyClient from "@/components/budget/projects/BudgetProjectsReadOnlyClient";

export default function BudgetProjectsPage() {
  return (
    <main
      style={{
        minHeight: "100%",
        padding: "20px",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1500px",
          margin: "0 auto",
        }}
      >
        <BudgetProjectsReadOnlyClient />
      </div>
    </main>
  );
}
