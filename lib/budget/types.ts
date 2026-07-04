export type BudgetProjectAttachment = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
};

export type BudgetProjectActivity = {
  id: string;
  projectId: string;
  name: string;
  lead: string;
  status: string;
  budgetSource: string;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
};

export type BudgetProjectListItem = {
  id: string;
  name: string;
  owner: string;
  lead: string;
  status: string;
  budget: number;
  spent: number;
  due: string;
  activities: BudgetProjectActivity[];
  attachments: BudgetProjectAttachment[];
};
