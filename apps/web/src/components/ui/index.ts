/**
 * flowd UI primitives. Import from "@/components/ui".
 *
 * Rules every feature follows:
 *  - Controls come from here; do not restyle Radix by hand and do not reinvent glass (use "@/components/glass").
 *  - Surfaces: L1 quiet glass for content (GlassCard), L2 for floating controls, L3 for sheets/popovers. Inside glass use
 *    fills (`bg-surface-field`), never more glass: `<Glass>` flattens itself when nested, and these primitives follow.
 *  - Money is always `<Money cents>` (integer cents, tabular Bricolage, state glyph). Counts that animate use `<CountUp>`.
 *  - Errors and confirmations: `notify.*` for toasts, `<ConfirmDialog>` only for irreversible actions, `notify.undo` for the rest.
 *  - Callable from server components (pure, no "use client"): buttonVariants, toneClasses, STATUS_META, initialsOf, moneyParts,
 *    formatMoneyText. Server-rendered without client JS: Badge, Pill, StatusPill, Avatar, AvatarStack, Skeleton*, EmptyState (its art tile hydrates).
 *    Everything else is a client component (state, effects or Radix behaviour) and can still be rendered from a server component.
 *  - Class merging: always `cn()` from "@/lib/utils". It knows the flowd text sizes, so `text-caption text-fg-muted` keeps both.
 */

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, type AccordionProps, type AccordionTriggerProps } from "./accordion";
export { Avatar, AvatarStack, initialsOf, type AvatarProps, type AvatarStackProps } from "./avatar";
export { Badge, Pill, StatusPill, STATUS_META, toneClasses, type BadgeProps, type StatusPillProps, type StatusMeta, type Tone } from "./badge";
export { Button, type ButtonProps } from "./button";
export { buttonVariants } from "./button-variants";
export { Callout, Banner, type CalloutProps, type BannerProps } from "./callout";
export { Checkbox, type CheckboxProps } from "./checkbox";
export { Chip, RemovableChip, ChipGroup, type ChipProps, type RemovableChipProps } from "./chip";
export {
  CommandPalette,
  type CommandPaletteProps,
  type CommandGroupDef,
  type CommandItemDef,
} from "./command-palette";
export {
  CopyButton,
  CopyIconButton,
  CopyField,
  type CopyButtonProps,
  type CopyIconButtonProps,
  type CopyFieldProps,
} from "./copy-button";
export { CountUp, type CountUpProps } from "./count-up";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  ConfirmDialog,
  type DialogContentProps,
  type ConfirmDialogProps,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  type DropdownMenuItemProps,
} from "./dropdown-menu";
export { EmptyState, EmptyArt, type EmptyStateProps, type EmptyArtProps, type EmptyArtName } from "./empty-state";
export { Field, useField, useFieldControl, type FieldProps } from "./field";
export { IconButton, type IconButtonProps } from "./icon-button";
export { Input, fieldVariants, type InputProps } from "./input";
export { Kbd, KbdShortcut, type KbdProps, type KbdShortcutProps } from "./kbd";
export { Money, type MoneyProps, type MoneyState, type MoneySize } from "./money";
export {
  moneyParts,
  formatMoneyText,
  type MoneyParts,
  type MoneyFormatOptions,
  type MoneyDecimals,
  type MoneySign,
} from "./money-format";
export { OverlaySurface, menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass } from "./overlay";
export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent, type PopoverContentProps } from "./popover";
export { Progress, ProgressRing, type ProgressProps, type ProgressRingProps, type ProgressTone } from "./progress";
export { RadioGroup, RadioGroupItem, type RadioGroupItemProps } from "./radio-group";
export { ScrollArea, type ScrollAreaProps } from "./scroll-area";
export { SearchInput, type SearchInputProps } from "./search-input";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./segmented-control";
export { Select, SelectItem, type SelectProps, type SelectOption, type SelectGroupDef } from "./select";
export { Separator, type SeparatorProps } from "./separator";
export {
  Sheet,
  Drawer,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
  type SheetProps,
  type SheetSide,
  type SheetContentProps,
} from "./sheet";
export { Skeleton, SkeletonText, SkeletonGroup, SkeletonRow, type SkeletonProps } from "./skeleton";
export { Slider, type SliderProps, type SliderMark } from "./slider";
export { Spinner, type SpinnerProps } from "./spinner";
export { Stepper, type StepperProps, type StepperStep } from "./stepper";
export { Switch, type SwitchProps } from "./switch";
export { Tabs, TabsList, TabsTrigger, TabsContent, type TabsProps, type TabsTriggerProps } from "./tabs";
export { Textarea, type TextareaProps } from "./textarea";
export { notify, ToastCard, type NotifyOptions, type NotifyTone, type ToastCardProps } from "./toast";
export { Tooltip, TooltipProvider, type TooltipProps, type TooltipProviderProps } from "./tooltip";
export { Root as VisuallyHidden } from "@radix-ui/react-visually-hidden";
