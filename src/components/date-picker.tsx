"use client";

import { useRouter } from "next/navigation";

export function DatePicker({ date }: { date: string }) {
  const router = useRouter();
  return (
    <form className="date-form" action="/reports" method="get">
      <label>
        Date
        <input
          type="date"
          name="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) router.push(`/reports?date=${event.target.value}`);
          }}
        />
      </label>
      <button type="submit" className="btn">
        Show
      </button>
    </form>
  );
}
