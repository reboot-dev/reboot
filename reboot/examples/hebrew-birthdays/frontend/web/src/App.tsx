import { usePerson } from "@api/birthdays/v1/person_rbt_react";
import { type UseUserApi } from "@api/birthdays/v1/user_rbt_react";
import {
  Cake,
  CalendarDays,
  LogOut,
  Moon,
  Sunset,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useState, type FC, type FormEvent, type ReactNode } from "react";
import {
  eveningBefore,
  formatGregorian,
  HEBREW_MONTHS,
  localToday,
  whenText,
} from "../../common/dates";

type Upcoming = NonNullable<
  ReturnType<UseUserApi["useUpcomingBirthdays"]>["response"]
>["birthdays"][number];

// The message to show for a mutation the backend refused. Our own
// errors carry a message written for people; anything else is
// unexpected.
function friendlyError(aborted: {
  error: { type: string } & Record<string, unknown>;
  message: string;
}): string {
  switch (aborted.error.type) {
    case "InvalidBirthdayError":
      return `That date doesn't work: ${String(aborted.error.message)}.`;
    case "PersonNotFoundError":
      return "That person is no longer on your list.";
    default:
      return aborted.message || "Something went wrong; please try again.";
  }
}

const Card: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <section
    className={`bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-7 border border-amber-300/20 ${className}`}
  >
    {children}
  </section>
);

const inputClass =
  "w-full px-3 py-2.5 bg-white/5 border border-indigo-300/30 rounded-lg text-white placeholder-indigo-200/40 focus:outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 [color-scheme:dark]";

const labelClass = "block text-indigo-100 text-sm font-medium mb-1.5";

const AddPerson: FC<{ user: UseUserApi }> = ({ user }) => {
  const [name, setName] = useState("");
  const [knows, setKnows] = useState<"gregorian" | "hebrew">("gregorian");
  const [gregorian, setGregorian] = useState("");
  const [afterSunset, setAfterSunset] = useState(false);
  const [hebrewDay, setHebrewDay] = useState("");
  const [hebrewMonth, setHebrewMonth] = useState("");
  const [hebrewYear, setHebrewYear] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();

  const ready =
    name.trim() !== "" &&
    (knows === "gregorian"
      ? gregorian !== ""
      : hebrewDay !== "" && hebrewMonth !== "" && hebrewYear !== "");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setAdded(undefined);
    const request =
      knows === "gregorian"
        ? { name, notes, gregorianBirthDate: gregorian, bornAfterSunset: afterSunset }
        : {
            name,
            notes,
            hebrewBirthDay: Number(hebrewDay),
            hebrewBirthMonth: hebrewMonth,
            hebrewBirthYear: Number(hebrewYear),
          };
    const { response, aborted } = await user.addPerson(request);
    if (aborted !== undefined) {
      setError(friendlyError(aborted));
      return;
    }
    setAdded(
      `Added ${name.trim()}, born ${response.hebrewBirthDate?.text ?? ""}.`
    );
    setName("");
    setGregorian("");
    setAfterSunset(false);
    setHebrewDay("");
    setHebrewMonth("");
    setHebrewYear("");
    setNotes("");
  };

  return (
    <Card>
      <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
        <UserPlus className="w-6 h-6 text-amber-300" />
        Add someone
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Grandma Rivka"
            autoComplete="off"
          />
        </div>

        <fieldset>
          <legend className={labelClass}>I know their date of birth on the</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["gregorian", "Gregorian calendar"],
                ["hebrew", "Hebrew calendar"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  knows === value
                    ? "border-amber-300 bg-amber-300/15 text-white"
                    : "border-indigo-300/30 text-indigo-100 hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name="calendar"
                  value={value}
                  checked={knows === value}
                  onChange={() => setKnows(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {knows === "gregorian" ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="gregorian-birth-date" className={labelClass}>
                Gregorian date of birth
              </label>
              <input
                id="gregorian-birth-date"
                type="date"
                value={gregorian}
                onChange={(e) => setGregorian(e.target.value)}
                className={inputClass}
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-indigo-100 cursor-pointer">
              <input
                type="checkbox"
                checked={afterSunset}
                onChange={(e) => setAfterSunset(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-400"
              />
              <span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Sunset className="w-4 h-4 text-amber-300" />
                  Born after sunset
                </span>
                <span className="block text-indigo-200/70">
                  The Hebrew day starts at sunset, so an evening birth is on
                  the next Hebrew date.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
            <div>
              <label htmlFor="hebrew-day" className={labelClass}>
                Day
              </label>
              <input
                id="hebrew-day"
                type="number"
                min={1}
                max={30}
                value={hebrewDay}
                onChange={(e) => setHebrewDay(e.target.value)}
                className={inputClass}
                placeholder="15"
              />
            </div>
            <div>
              <label htmlFor="hebrew-month" className={labelClass}>
                Month
              </label>
              <select
                id="hebrew-month"
                value={hebrewMonth}
                onChange={(e) => setHebrewMonth(e.target.value)}
                className={inputClass}
              >
                <option value="" className="bg-indigo-950">
                  Choose…
                </option>
                {HEBREW_MONTHS.map((month) => (
                  <option key={month} value={month} className="bg-indigo-950">
                    {month}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hebrew-year" className={labelClass}>
                Year
              </label>
              <input
                id="hebrew-year"
                type="number"
                min={1}
                value={hebrewYear}
                onChange={(e) => setHebrewYear(e.target.value)}
                className={inputClass}
                placeholder="5750"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder="Likes chocolate babka"
            autoComplete="off"
          />
        </div>

        {error !== undefined && (
          <p role="alert" className="text-sm text-rose-200 bg-rose-500/15 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {added !== undefined && (
          <p role="status" className="text-sm text-emerald-200 bg-emerald-500/15 rounded-lg px-3 py-2">
            {added}
          </p>
        )}

        <button
          type="submit"
          disabled={!ready || user.addPerson.pending.length > 0}
          className="w-full bg-amber-400 text-indigo-950 font-semibold py-3 px-6 rounded-lg hover:bg-amber-300 transition-colors shadow-lg disabled:opacity-50 disabled:hover:bg-amber-400"
        >
          Add person
        </button>
      </form>
    </Card>
  );
};

const BirthdayRow: FC<{
  birthday: Upcoming;
  onSelect: () => void;
  onRemove: () => void;
}> = ({ birthday, onSelect, onRemove }) => {
  const next = birthday.nextBirthday;
  const soon = next !== undefined && next.daysUntil <= 7;
  return (
    <tr className="border-b border-indigo-300/10 align-top">
      <td className="py-3 pr-3">
        <button
          onClick={onSelect}
          className="font-semibold text-white hover:text-amber-200 text-left underline-offset-4 hover:underline"
        >
          {birthday.name}
        </button>
        {birthday.notes !== "" && (
          <div className="text-xs text-indigo-200/60 mt-0.5">{birthday.notes}</div>
        )}
      </td>
      <td className="py-3 pr-3 hidden sm:table-cell">
        <div className="text-indigo-50">{birthday.hebrewBirthDate?.text}</div>
        <div className="text-indigo-200/70 text-sm" lang="he" dir="rtl">
          {birthday.hebrewBirthDate?.hebrewText}
        </div>
      </td>
      <td className="py-3 pr-3">
        {next !== undefined && (
          <>
            <div className="text-white">{formatGregorian(next.gregorianDate)}</div>
            <div className="text-xs text-indigo-200/70">
              {next.hebrewDate?.text}
              <span className="sm:hidden"> · born {birthday.hebrewBirthDate?.text}</span>
            </div>
            <div
              className={`inline-block mt-1 text-xs font-semibold rounded-full px-2 py-0.5 ${
                soon ? "bg-amber-300 text-indigo-950" : "bg-white/10 text-indigo-100"
              }`}
            >
              {whenText(next.daysUntil)}
            </div>
          </>
        )}
      </td>
      <td className="py-3 pr-3 text-center text-white font-semibold">
        {next?.age}
      </td>
      <td className="py-3 text-right">
        <button
          onClick={onRemove}
          aria-label={`Remove ${birthday.name}`}
          className="p-2 rounded-lg text-indigo-200/60 hover:text-rose-200 hover:bg-rose-500/15 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

const UpcomingBirthdays: FC<{
  user: UseUserApi;
  today: string;
  onSelect: (personId: string) => void;
}> = ({ user, today, onSelect }) => {
  const [withinDays, setWithinDays] = useState(0);
  const [error, setError] = useState<string>();
  const { response, isLoading } = user.useUpcomingBirthdays({
    today,
    withinDays,
  });

  const remove = async (birthday: Upcoming) => {
    if (!window.confirm(`Stop tracking ${birthday.name}'s birthday?`)) {
      return;
    }
    const { aborted } = await user.removePerson({ personId: birthday.personId });
    setError(aborted !== undefined ? friendlyError(aborted) : undefined);
  };

  const birthdays = response?.birthdays ?? [];

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2
          id="upcoming-birthdays"
          className="text-xl font-bold text-white flex items-center gap-2"
        >
          <CalendarDays className="w-6 h-6 text-amber-300" />
          Upcoming birthdays
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="within-days" className="text-sm text-indigo-100">
            Show
          </label>
          <select
            id="within-days"
            value={withinDays}
            onChange={(e) => setWithinDays(Number(e.target.value))}
            className="px-2 py-1.5 bg-white/5 border border-indigo-300/30 rounded-lg text-white text-sm focus:outline-none focus:border-amber-300"
          >
            <option value={0} className="bg-indigo-950">Everyone</option>
            <option value={30} className="bg-indigo-950">Next 30 days</option>
            <option value={90} className="bg-indigo-950">Next 3 months</option>
          </select>
        </div>
      </div>
      {error !== undefined && (
        <p role="alert" className="text-sm text-rose-200 bg-rose-500/15 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}
      {isLoading && response === undefined ? (
        <p className="text-indigo-100 animate-pulse">Loading…</p>
      ) : birthdays.length === 0 ? (
        <p className="text-indigo-100/80 py-6 text-center">
          {withinDays === 0
            ? "Nobody yet — add someone to start tracking their Hebrew birthday."
            : "No Hebrew birthdays in that time."}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table aria-labelledby="upcoming-birthdays" className="w-full text-left">
            <thead>
              <tr className="border-b border-indigo-300/20 text-xs uppercase tracking-wider text-indigo-200/80">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold hidden sm:table-cell">
                  Hebrew birthday
                </th>
                <th className="py-2 pr-3 font-semibold">Next</th>
                <th className="py-2 pr-3 font-semibold text-center">Turning</th>
                <th className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {birthdays.map((birthday) => (
                <BirthdayRow
                  key={birthday.personId}
                  birthday={birthday}
                  onSelect={() => onSelect(birthday.personId)}
                  onRemove={() => void remove(birthday)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

// One person's Hebrew birthday over the next few years. Mounted only
// with a real person id, from a row of the list.
const PersonDetails: FC<{
  personId: string;
  today: string;
  onClose: () => void;
}> = ({ personId, today, onClose }) => {
  const person = usePerson({ id: personId });
  const { response } = person.useGet({ today, years: 5 });

  return (
    <div
      className="fixed inset-0 z-10 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="person-name"
        className="w-full sm:max-w-lg bg-indigo-950 border border-amber-300/30 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="person-name" className="text-2xl font-bold text-white">
            {response?.name ?? "…"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-indigo-200 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {response !== undefined && (
          <>
            <div className="rounded-xl bg-white/5 p-4 mb-5">
              <div className="text-indigo-200/80 text-xs uppercase tracking-wider mb-1">
                Hebrew date of birth
              </div>
              <div className="text-white text-lg font-semibold">
                {response.hebrewBirthDate?.text}
              </div>
              <div className="text-amber-200 text-lg" lang="he" dir="rtl">
                {response.hebrewBirthDate?.hebrewText}
              </div>
              {response.gregorianBirthDate !== "" && (
                <div className="text-indigo-200/80 text-sm mt-2 flex items-center gap-1.5">
                  Born {formatGregorian(response.gregorianBirthDate)}
                  {response.bornAfterSunset && (
                    <>
                      , after sunset <Moon className="w-3.5 h-3.5" />
                    </>
                  )}
                </div>
              )}
              {response.notes !== "" && (
                <div className="text-indigo-100 text-sm mt-2">{response.notes}</div>
              )}
            </div>
            <h3 className="text-indigo-100 font-semibold mb-2">Next Hebrew birthdays</h3>
            <ol className="space-y-2">
              {response.upcoming.map((birthday) => (
                <li
                  key={birthday.gregorianDate}
                  className="flex items-center justify-between gap-3 rounded-lg border border-indigo-300/15 px-3 py-2"
                >
                  <div>
                    <div className="text-white font-medium">
                      {formatGregorian(birthday.gregorianDate)}
                    </div>
                    <div className="text-xs text-indigo-200/70">
                      {birthday.hebrewDate?.text} · begins at sunset{" "}
                      {eveningBefore(birthday.gregorianDate)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-amber-200 font-semibold">
                      Turns {birthday.age}
                    </div>
                    <div className="text-xs text-indigo-200/70">
                      {whenText(birthday.daysUntil)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
};

const Today: FC<{ user: UseUserApi; today: string }> = ({ user, today }) => {
  const { response } = user.useConvertDate({ gregorianDate: today });
  if (response?.hebrewDate === undefined) {
    return null;
  }
  return (
    <p className="text-indigo-100/90">
      Today is <span className="text-white font-semibold">{response.hebrewDate.text}</span>{" "}
      <span className="text-amber-200" lang="he" dir="rtl">
        {response.hebrewDate.hebrewText}
      </span>
    </p>
  );
};

// The signed-in user's birthdays. Sign-in auto-constructed their
// `User`, which holds their own list of people, so everything here is
// theirs alone.
const App: FC<{ user: UseUserApi; onSignOut: () => void }> = ({
  user,
  onSignOut,
}) => {
  // Counted from where the viewer is, refreshed on each render.
  const today = localToday();
  const [selected, setSelected] = useState<string>();

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white flex items-center gap-3">
              <Cake className="w-9 h-9 text-amber-300" />
              Hebrew Birthdays
            </h1>
            <div className="mt-2">
              <Today user={user} today={today} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-indigo-200/80 text-sm truncate">
              Signed in as <span className="text-white font-medium">{user.state_id}</span>
            </span>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-indigo-100 text-sm font-medium bg-white/5 border border-indigo-300/30 rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <UpcomingBirthdays user={user} today={today} onSelect={setSelected} />
          <div className="lg:col-start-3 lg:row-start-1">
            <AddPerson user={user} />
          </div>
        </div>
      </div>
      {selected !== undefined && (
        <PersonDetails
          personId={selected}
          today={today}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
};

export default App;
