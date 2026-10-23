// frontend/mcp/person/App.tsx
import {
  type UsePersonApi,
  usePerson,
} from "@api/birthdays/v1/person_rbt_react";
import { type FC } from "react";
import {
  eveningBefore,
  formatGregorian,
  localToday,
  whenText,
} from "../../common/dates";
import css from "./App.module.css";

// One person's Hebrew birthday card: their Hebrew date of birth and
// the Gregorian dates of their next few Hebrew birthdays. The person's
// id is inferred from the MCP tool call that opened this UI.
export const PersonApp: FC = () => {
  const { person, isLoading } = usePerson();

  if (isLoading) {
    return <div className={css.notice}>Loading…</div>;
  }

  if (person === undefined) {
    console.error("No Person id was available; cannot render.");
    return (
      <div className={css.notice}>An error occurred, sorry about that!</div>
    );
  }

  return <Card person={person} />;
};

const Card: FC<{ person: UsePersonApi }> = ({ person }) => {
  const { response, isLoading } = person.useGet({
    today: localToday(),
    years: 5,
  });

  if (isLoading && response === undefined) {
    return <div className={css.notice}>Loading…</div>;
  }
  if (response === undefined || response.hebrewBirthDate === undefined) {
    return <div className={css.notice}>This person is no longer tracked.</div>;
  }

  const [next, ...later] = response.upcoming;

  return (
    <div className={css.card}>
      <div className={css.header}>
        <div>
          <h1 className={css.name}>{response.name}</h1>
          <div className={css.muted}>
            Born {response.hebrewBirthDate.text}
            {response.gregorianBirthDate !== "" &&
              ` · ${formatGregorian(response.gregorianBirthDate)}${
                response.bornAfterSunset ? " (after sunset)" : ""
              }`}
          </div>
        </div>
        <div className={css.hebrew} lang="he" dir="rtl">
          {response.hebrewBirthDate.hebrewText}
        </div>
      </div>

      {next !== undefined && (
        <div className={css.next}>
          <div className={css.label}>Next Hebrew birthday</div>
          <div className={css.big}>{formatGregorian(next.gregorianDate)}</div>
          <div className={css.muted}>
            {next.hebrewDate?.text} · turns {next.age} ·{" "}
            {whenText(next.daysUntil)}
          </div>
          <div className={css.muted}>
            Begins at sunset on {eveningBefore(next.gregorianDate)}
          </div>
        </div>
      )}

      {later.length > 0 && (
        <table className={css.table}>
          <thead>
            <tr>
              <th>Year after</th>
              <th>Hebrew date</th>
              <th className={css.right}>Age</th>
            </tr>
          </thead>
          <tbody>
            {later.map((birthday) => (
              <tr key={birthday.gregorianDate}>
                <td>{formatGregorian(birthday.gregorianDate)}</td>
                <td>{birthday.hebrewDate?.text}</td>
                <td className={css.right}>{birthday.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {response.notes !== "" && <p className={css.notes}>{response.notes}</p>}
    </div>
  );
};
