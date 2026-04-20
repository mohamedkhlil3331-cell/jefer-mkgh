import type { UserRole } from "../mockData";

// ─────────────────────────────────────────────────────────────────────────────
// RBAC — Role-Based Access Control
// Defines which UI components and actions are visible per role.
// ─────────────────────────────────────────────────────────────────────────────

export interface RolePermissions {
  // Navigation items
  canSeeOrderForm: boolean;
  canSeeOrderTracking: boolean;
  canSeeAIChat: boolean;
  canSeeOrdersQueue: boolean;
  canSeeInventory: boolean;
  canSeeAnalytics: boolean;
  canSeeFleet: boolean;
  canSeeDriverAssignment: boolean;
  canSeeDriverTasks: boolean;
  canSeeExpenseReport: boolean;
  canSeeMaintenanceReport: boolean;
  canSeePayoutCalculator: boolean;

  // Actions
  canApproveOrders: boolean;
  canRejectOrders: boolean;
  canMarkOrderDelivered: boolean;
  canEditInventory: boolean;
  canAssignDrivers: boolean;
  canViewAllExpenses: boolean;
  canViewOwnExpenses: boolean;
  canSubmitExpense: boolean;
  canSubmitMaintenance: boolean;
  canViewPaymentInfo: boolean;
  canViewAllDriverPayouts: boolean;
  canViewOwnPayout: boolean;

  // Data visibility
  canSeeAllOrders: boolean;
  canSeeOwnOrdersOnly: boolean;
  canSeeVehicleExpenses: boolean;
}

export const userPermissions: Record<UserRole, RolePermissions> = {
  customer: {
    canSeeOrderForm: true,
    canSeeOrderTracking: true,
    canSeeAIChat: true,
    canSeeOrdersQueue: false,
    canSeeInventory: false,
    canSeeAnalytics: false,
    canSeeFleet: false,
    canSeeDriverAssignment: false,
    canSeeDriverTasks: false,
    canSeeExpenseReport: false,
    canSeeMaintenanceReport: false,
    canSeePayoutCalculator: false,

    canApproveOrders: false,
    canRejectOrders: false,
    canMarkOrderDelivered: false,
    canEditInventory: false,
    canAssignDrivers: false,
    canViewAllExpenses: false,
    canViewOwnExpenses: false,
    canSubmitExpense: false,
    canSubmitMaintenance: false,
    canViewPaymentInfo: true,
    canViewAllDriverPayouts: false,
    canViewOwnPayout: false,

    canSeeAllOrders: false,
    canSeeOwnOrdersOnly: true,
    canSeeVehicleExpenses: false,
  },

  reviewer: {
    canSeeOrderForm: false,
    canSeeOrderTracking: true,
    canSeeAIChat: false,
    canSeeOrdersQueue: true,
    canSeeInventory: true,
    canSeeAnalytics: true,
    canSeeFleet: false,
    canSeeDriverAssignment: false,
    canSeeDriverTasks: false,
    canSeeExpenseReport: false,
    canSeeMaintenanceReport: false,
    canSeePayoutCalculator: false,

    canApproveOrders: true,
    canRejectOrders: true,
    canMarkOrderDelivered: true,
    canEditInventory: true,
    canAssignDrivers: false,
    canViewAllExpenses: true,
    canViewOwnExpenses: true,
    canSubmitExpense: false,
    canSubmitMaintenance: false,
    canViewPaymentInfo: true,
    canViewAllDriverPayouts: true,
    canViewOwnPayout: false,

    canSeeAllOrders: true,
    canSeeOwnOrdersOnly: false,
    canSeeVehicleExpenses: true,
  },

  supervisor: {
    canSeeOrderForm: false,
    canSeeOrderTracking: true,
    canSeeAIChat: false,
    canSeeOrdersQueue: true,
    canSeeInventory: true,
    canSeeAnalytics: true,
    canSeeFleet: true,
    canSeeDriverAssignment: true,
    canSeeDriverTasks: false,
    canSeeExpenseReport: false,
    canSeeMaintenanceReport: true,
    canSeePayoutCalculator: true,

    canApproveOrders: false,
    canRejectOrders: false,
    canMarkOrderDelivered: false,
    canEditInventory: false,
    canAssignDrivers: true,
    canViewAllExpenses: true,
    canViewOwnExpenses: true,
    canSubmitExpense: false,
    canSubmitMaintenance: false,
    canViewPaymentInfo: true,
    canViewAllDriverPayouts: true,
    canViewOwnPayout: false,

    canSeeAllOrders: true,
    canSeeOwnOrdersOnly: false,
    canSeeVehicleExpenses: true,
  },

  driver: {
    canSeeOrderForm: false,
    canSeeOrderTracking: false,
    canSeeAIChat: false,
    canSeeOrdersQueue: false,
    canSeeInventory: false,
    canSeeAnalytics: false,
    canSeeFleet: false,
    canSeeDriverAssignment: false,
    canSeeDriverTasks: true,
    canSeeExpenseReport: true,
    canSeeMaintenanceReport: true,
    canSeePayoutCalculator: true,

    canApproveOrders: false,
    canRejectOrders: false,
    canMarkOrderDelivered: true,
    canEditInventory: false,
    canAssignDrivers: false,
    canViewAllExpenses: false,
    canViewOwnExpenses: true,
    canSubmitExpense: true,
    canSubmitMaintenance: true,
    canViewPaymentInfo: false,
    canViewAllDriverPayouts: false,
    canViewOwnPayout: true,

    canSeeAllOrders: false,
    canSeeOwnOrdersOnly: true,
    canSeeVehicleExpenses: false,
  },
};

/** Convenience hook-like helper to get permissions for a role */
export function getPermissions(role: UserRole): RolePermissions {
  return userPermissions[role];
}
