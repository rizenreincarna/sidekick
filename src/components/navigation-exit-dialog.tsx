"use client";

// Exit-navigation confirmation dialog (dark cockpit styling).

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmExit: () => void;
}

export default function NavigationExitDialog({ open, onOpenChange, onConfirmExit }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-white/10">
        <AlertDialogHeader>
          <AlertDialogTitle>Exit navigation?</AlertDialogTitle>
          <AlertDialogDescription>
            Turn-by-turn guidance will stop. Your route progress is saved — you can resume
            navigation from the route planner.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-white/5 hover:bg-white/10">
            Keep navigating
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmExit}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Exit navigation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
