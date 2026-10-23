// frontend/mcp/birthdays/App.tsx
import { type UseUserApi, useUser } from "@api/birthdays/v1/user_rbt_react";
import { useState, type FC, type FormEvent } from "react";
import { formatGregorian, localToday, whenText } from "../../common/dates";
import css from "./App.module.css";

// A live list of everyone the signed-in user tracks, soonest Hebrew
// birthday first, with a quick way to add someone. `useUpcomingBirthdays`
// is reactive, so people the AI adds in the chat appear here at once.
export const BirthdaysApp: FC = () => {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <div className={css.notice}>Loading…</div>;
  }

  if (user === undefined) {
    console.error("No signed-in user was available; cannot render.");
    return (
      <div className={css.notice}>An error occurred, sorry about that!</div>
    );
  }

  return <Birthdays user={user} />;
};

const AddPerson: FC<{ user: UseUserApi }> = ({ user }) => {
  const [name, setName] = useState("");
  const [born, setBorn] = useState("");
  const [afterSunset, setAfterSunset] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const { aborted } = await user.addPerson({
      name,
      gregorianBirthDate: born,
      bornAfterSunset: afterSunset,
    });
    if (aborted !== undefined) {
      setError(
        aborted.error.type === "InvalidBirthdayError"
          ? String(aborted.error.message)
          : aborted.message
      );
      return;
    }
    setName("");
    setBorn("");
    setAfterSunset(false);
  };

  return (
    <form className={css.form} onSubmit={handleSubmit}>
      <label className={css.field}>
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={css.field}>
        <span>Born</span>
        <input
          type="date"
          value={born}
          onChange={(e) => setBorn(e.target.value)}
        />
      </label>
      <label className={css.checkbox}>
        <input
          type="checkbox"
          checked={afterSunset}
          onChange={(e) => setAfterSunset(e.target.checked)}
        />
        after sunset
      </label>
      <button
        className={css.button}
        type="submit"
        disabled={name.trim() === "" || born === ""}
      >
        Add
      </button>
      {error !== undefined && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
    </form>
  );
};

const Birthdays: FC<{ user: UseUserApi }> = ({ user }) => {
  const today = localToday();
  const { response, isLoading } = user.useUpcomingBirthdays({ today });
  const birthdays = response?.birthdays ?? [];

  return (
    <div className={css.container}>
      <h1 className={css.title}>🎂 Hebrew Birthdays</h1>
      {isLoading && response === undefined ? (
        <div className={css.notice}>Loading…</div>
      ) : birthdays.length === 0 ? (
        <div className={css.notice}>
          Nobody yet. Add someone below, or ask me to!
        </div>
      ) : (
        <ul className={css.list}>
          {birthdays.map(({ personId, name, hebrewBirthDate, nextBirthday }) => (
            <li key={personId} className={css.item}>
              <div>
                <div className={css.name}>{name}</div>
                <div className={css.muted}>
                  Born {hebrewBirthDate?.text}{" "}
                  <span lang="he" dir="rtl">
                    · {hebrewBirthDate?.hebrewText}
                  </span>
                </div>
              </div>
              {nextBirthday !== undefined && (
                <div className={css.next}>
                  <div className={css.date}>
                    {formatGregorian(nextBirthday.gregorianDate)}
                  </div>
                  <div className={css.muted}>
                    turns {nextBirthday.age} ·{" "}
                    <span
                      className={
                        nextBirthday.daysUntil <= 7 ? css.soon : undefined
                      }
                    >
                      {whenText(nextBirthday.daysUntil)}
                    </span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddPerson user={user} />
    </div>
  );
};
