import { useState } from "react";
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Hexagon,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader, SubPageHeader } from "@/components/boared/PageHeader";
import { Kicker, SectionRule } from "@/components/boared/Kicker";
import { Wire, WireList } from "@/components/boared/Wire";
import { Clipping } from "@/components/boared/Clipping";
import { Wordmark } from "@/components/boared/Wordmark";

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div
        className="h-10 w-10 shrink-0 border border-[var(--boared-rule)]"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div className="min-w-0">
        <p className="font-mono text-[0.68rem] text-foreground truncate">{cssVar}</p>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">{name}</p>
      </div>
    </div>
  );
}

export function DesignGuide() {
  const [selectValue, setSelectValue] = useState("in_progress");
  const [menuChecked, setMenuChecked] = useState(true);

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§00 · Design guide</>}
        title={
          <>
            The <em>Boared</em>
            <br />
            style book.
          </>
        }
        dateline={`${todayDateline()} · Editorial primitives on file`}
      />

      {/* Wordmark */}
      <SectionRule label="Wordmark" meta="Italic Fraunces, acid stamp" />
      <div className="flex flex-wrap items-end gap-10 py-6">
        <div className="flex flex-col gap-2">
          <Kicker>Small</Kicker>
          <Wordmark size="sm" />
        </div>
        <div className="flex flex-col gap-2">
          <Kicker>Default</Kicker>
          <Wordmark />
        </div>
        <div className="flex flex-col gap-2">
          <Kicker>Large</Kicker>
          <Wordmark size="lg" />
        </div>
      </div>

      {/* Typography */}
      <SectionRule label="Typography" />
      <div className="space-y-6 py-4">
        <div>
          <Kicker>Display · Fraunces italic</Kicker>
          <h1 className="boared-display text-[3.25rem] leading-[0.95] mt-2">
            A quiet paper for <em>loud</em> companies.
          </h1>
        </div>
        <div>
          <Kicker>Body · Fragment Mono</Kicker>
          <p className="font-mono text-[0.82rem] leading-relaxed max-w-[60ch] mt-2">
            The body copy reads in Fragment Mono. It feels typed, provisional, set by hand. Use it for every block of running text, form field, and list row.
          </p>
        </div>
        <div>
          <Kicker>Label · mono caps</Kicker>
          <div className="boared-label text-foreground mt-2">§04 · Issues · Today</div>
        </div>
      </div>

      {/* Colors */}
      <SectionRule label="Palette" meta="One accent: oxblood stamp" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 border border-[var(--boared-rule)] divide-x divide-y divide-[var(--boared-rule)]">
        <Swatch name="Paper" cssVar="--boared-paper" />
        <Swatch name="Paper 2" cssVar="--boared-paper-2" />
        <Swatch name="Ink" cssVar="--boared-ink" />
        <Swatch name="Ink soft" cssVar="--boared-ink-soft" />
        <Swatch name="Ink faint" cssVar="--boared-ink-faint" />
        <Swatch name="Rule" cssVar="--boared-rule" />
        <Swatch name="Acid" cssVar="--boared-acid" />
        <Swatch name="Blood" cssVar="--boared-blood" />
      </div>

      {/* PageHeader variants */}
      <SectionRule label="Page headers" />
      <div className="space-y-6 py-4">
        <div className="border border-[var(--boared-rule)] p-6">
          <PageHeader
            kicker={<>§07 · Sample</>}
            title={<>An <em>editorial</em> title block.</>}
            dateline="Kicker, Fraunces title, optional dateline, optional actions."
            actions={<Button size="sm">New thing</Button>}
          />
        </div>
        <div className="border border-[var(--boared-rule)] p-6">
          <SubPageHeader
            kicker={<>§07.1 · Sub-page</>}
            title={<>Smaller <em>sub-page</em> title.</>}
            dateline="Used inside an existing parent header."
          />
        </div>
      </div>

      {/* Wires */}
      <SectionRule label="Wire & WireList" meta="Hairline rows, no chrome" />
      <WireList className="py-2">
        <Wire
          leading={<span className="block size-2.5" style={{ backgroundColor: "var(--boared-acid)" }} />}
          title={<div className="truncate">Ship the Boared reskin</div>}
          meta="Today"
          trailing={<StatusBadge status="in_progress" />}
        />
        <Wire
          leading={<span className="block size-2.5 bg-foreground" />}
          title={<div className="truncate">Draft the design guide</div>}
          meta="Yesterday"
          trailing={<StatusBadge status="done" />}
        />
        <Wire
          active
          leading={<span className="block size-2.5" style={{ backgroundColor: "var(--boared-ink-faint)" }} />}
          title={<div className="truncate">Active row (acid bar, left edge)</div>}
          meta="Now"
          trailing={<StatusBadge status="active" />}
        />
      </WireList>

      {/* Clipping */}
      <SectionRule label="Clippings" meta="Flat bordered blocks" />
      <div className="grid md:grid-cols-3 gap-4 py-2">
        <Clipping kicker="§ · Default" title={<>The <em>default</em> clipping.</>} meta="Hairline footer">
          <p className="font-mono text-[0.72rem] text-muted-foreground">
            Flat, bordered, with a kicker, title, and optional meta footer.
          </p>
        </Clipping>
        <Clipping variant="inset" kicker="§ · Inset" title={<>Inset <em>variant.</em></>}>
          <p className="font-mono text-[0.72rem] text-muted-foreground">
            Paper-2 background, no border. For nested blocks.
          </p>
        </Clipping>
        <Clipping variant="acid" kicker="§ · Acid" title={<>Acid <em>variant.</em></>}>
          <p className="font-mono text-[0.72rem]">
            Stamp-red block. Use sparingly, as a highlight.
          </p>
        </Clipping>
      </div>

      {/* Kicker + SectionRule */}
      <SectionRule label="Kicker" />
      <div className="space-y-4 py-2">
        <Kicker>§04 · Plain kicker</Kicker>
        <SectionRule label="SectionRule with meta" meta="Last 14 days" />
      </div>

      {/* Buttons */}
      <SectionRule label="Buttons" />
      <div className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button><Plus /> New</Button>
          <Button variant="outline"><Upload /> Upload</Button>
          <Button variant="destructive"><Trash2 /> Delete</Button>
          <Button disabled>Disabled</Button>
        </div>
      </div>

      {/* Badges */}
      <SectionRule label="Badges" />
      <div className="flex flex-wrap items-center gap-2 py-4">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="ghost">Ghost</Badge>
      </div>

      {/* Form elements */}
      <SectionRule label="Form elements" />
      <div className="grid gap-6 md:grid-cols-2 py-4">
        <div className="space-y-2">
          <Label htmlFor="demo-input" className="boared-label text-muted-foreground">Input</Label>
          <Input id="demo-input" placeholder="Type something…" />
          <Input placeholder="Disabled" disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="demo-textarea" className="boared-label text-muted-foreground">Textarea</Label>
          <Textarea id="demo-textarea" placeholder="Write a comment…" />
        </div>
        <div className="space-y-3">
          <Label className="boared-label text-muted-foreground">Checkbox</Label>
          <div className="flex items-center gap-2">
            <Checkbox id="c1" defaultChecked />
            <Label htmlFor="c1">Checked</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="c2" />
            <Label htmlFor="c2">Unchecked</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="c3" disabled />
            <Label htmlFor="c3">Disabled</Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="boared-label text-muted-foreground">Select</Label>
          <Select value={selectValue} onValueChange={setSelectValue}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="todo">Todo</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <SectionRule label="Tabs" meta="Line-only" />
      <div className="py-4">
        <Tabs defaultValue="overview">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="font-mono text-[0.72rem] text-muted-foreground py-4">Overview tab content.</p>
          </TabsContent>
          <TabsContent value="runs">
            <p className="font-mono text-[0.72rem] text-muted-foreground py-4">Runs tab content.</p>
          </TabsContent>
          <TabsContent value="config">
            <p className="font-mono text-[0.72rem] text-muted-foreground py-4">Config tab content.</p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Overlays */}
      <SectionRule label="Overlays" />
      <div className="flex flex-wrap items-center gap-2 py-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit the thing</DialogTitle>
              <DialogDescription>Make a change, save it, move on.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Name</Label>
              <Input placeholder="A name" />
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Open popover</Button>
          </PopoverTrigger>
          <PopoverContent className="space-y-2">
            <p className="boared-label text-foreground">Heartbeat</p>
            <p className="font-mono text-[0.68rem] text-muted-foreground">Last run 24s ago. Next in 9m.</p>
            <Button size="xs">Wake now</Button>
          </PopoverContent>
        </Popover>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Open sheet</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Properties</SheetTitle>
              <SheetDescription>Edit metadata inline.</SheetDescription>
            </SheetHeader>
            <div className="px-4 space-y-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input defaultValue="Improve onboarding docs" />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Save</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm"><Settings /></Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Quick actions <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>
              <Check className="h-4 w-4" />
              Mark as done
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BookOpen className="h-4 w-4" />
              Open docs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={menuChecked}
              onCheckedChange={(v) => setMenuChecked(v === true)}
            >
              Watch issue
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem variant="destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Card */}
      <SectionRule label="Card" />
      <div className="py-4 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description with supporting text.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-[0.72rem]">Card content goes here. This is the main body area.</p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">Action</Button>
            <Button variant="outline" size="sm">Cancel</Button>
          </CardFooter>
        </Card>
      </div>

      {/* Avatar */}
      <SectionRule label="Avatars" meta="Square by convention" />
      <div className="flex items-center gap-6 py-4">
        <Avatar size="sm"><AvatarFallback>SM</AvatarFallback></Avatar>
        <Avatar><AvatarFallback>DF</AvatarFallback></Avatar>
        <Avatar size="lg"><AvatarFallback>LG</AvatarFallback></Avatar>
        <AvatarGroup>
          <Avatar><AvatarFallback>A1</AvatarFallback></Avatar>
          <Avatar><AvatarFallback>A2</AvatarFallback></Avatar>
          <Avatar><AvatarFallback>A3</AvatarFallback></Avatar>
          <AvatarGroupCount>+5</AvatarGroupCount>
        </AvatarGroup>
      </div>

      {/* Separator */}
      <SectionRule label="Separator" />
      <div className="py-4 space-y-4">
        <Separator />
        <div className="flex items-center gap-4 h-8">
          <span className="font-mono text-[0.72rem]">Left</span>
          <Separator orientation="vertical" />
          <span className="font-mono text-[0.72rem]">Right</span>
        </div>
      </div>

      {/* Skeleton */}
      <SectionRule label="Skeleton" />
      <div className="py-4 space-y-2 max-w-md">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>

      {/* Status system */}
      <SectionRule label="Status system" />
      <div className="flex flex-wrap items-center gap-2 py-4">
        {[
          "active", "running", "paused", "idle", "archived", "planned",
          "completed", "failed", "succeeded", "error", "pending_approval",
          "backlog", "todo", "in_progress", "in_review", "blocked", "done",
          "cancelled", "approved", "rejected",
        ].map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>

      {/* Icon reference */}
      <SectionRule label="Iconography" meta="Lucide, used sparingly" />
      <div className="grid grid-cols-4 md:grid-cols-8 gap-0 border border-[var(--boared-rule)] divide-x divide-y divide-[var(--boared-rule)]">
        {[
          ["LayoutDashboard", LayoutDashboard],
          ["Bot", Bot],
          ["CircleDot", CircleDot],
          ["Hexagon", Hexagon],
          ["Search", Search],
          ["Plus", Plus],
          ["Settings", Settings],
          ["Trash2", Trash2],
        ].map(([name, Icon]) => {
          const LucideIcon = Icon as React.FC<{ className?: string }>;
          return (
            <div key={name as string} className="flex flex-col items-center gap-1.5 p-3">
              <LucideIcon className="h-4 w-4 text-foreground" />
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-muted-foreground">{name as string}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-12 pt-4 border-t border-[var(--boared-rule)] font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground flex items-center justify-between">
        <span>End of style book</span>
        <span>Set in Fraunces &amp; Fragment Mono</span>
      </div>
    </div>
  );
}
