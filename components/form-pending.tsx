"use client";
import { createContext, useContext } from "react";
export const PendingContext = createContext(false);
export function useActionPending() { return useContext(PendingContext); }
