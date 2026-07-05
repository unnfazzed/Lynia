import type { IssueStatus, IssueType, RaiseIssueRequest, RaiseSosRequest, ReportUserRequest } from "@lynia/shared";
import { apiFetch } from "./client";

/**
 * Trust & safety endpoints (A-05 / R-16 / F-13). The RULES/SAFETY API agents are building the backing
 * routes concurrently; these are coded to the documented contract. Each request carries `orderId` in the
 * body as well as the path so the payload matches the shared zod schema exactly — the server derives the
 * opener + subject from the auth context and the order.
 */

/** The issue the server created for a "get help with this trip" report. */
export interface RaisedIssue {
  id: string;
  orderId: string;
  type: IssueType;
  status: IssueStatus;
  description: string;
  createdAt: string;
}

/** Raise an order-level dispute / help request (both roles). POST /orders/:id/issues → the created issue. */
export function raiseIssue(orderId: string, body: Omit<RaiseIssueRequest, "orderId">): Promise<RaisedIssue> {
  return apiFetch<RaisedIssue>(`/orders/${orderId}/issues`, { method: "POST", body: { orderId, ...body } });
}

/** The outcome of a report — whether the optional block was applied. */
export interface ReportResult {
  id: string;
  blocked: boolean;
}

/** Report the order counterparty after a trip, optionally blocking a future rematch. POST /orders/:id/report. */
export function reportUser(orderId: string, body: Omit<ReportUserRequest, "orderId">): Promise<ReportResult> {
  return apiFetch<ReportResult>(`/orders/${orderId}/report`, { method: "POST", body: { orderId, ...body } });
}

/** Contacts the SOS endpoint returns — the local emergency number + the staffed Lynia safety line. */
export interface SosContacts {
  emergencyNumber: string;
  safetyLine: string;
}

/** Raise an SOS on a live trip (both roles). POST /orders/:id/sos → the numbers to call. Location optional. */
export function raiseSos(orderId: string, body: Omit<RaiseSosRequest, "orderId"> = {}): Promise<SosContacts> {
  return apiFetch<SosContacts>(`/orders/${orderId}/sos`, { method: "POST", body: { orderId, ...body } });
}
