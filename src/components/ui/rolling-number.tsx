import NumberFlow from "@number-flow/react";

export function RollingNumber({
  value,
  prefix = "",
  suffix = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  return <NumberFlow value={value} prefix={prefix} suffix={suffix} willChange />;
}

export function RollingDuration({ minutes }: { minutes: number }) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return (
    <span className="inline-flex items-center justify-center gap-1 tabular-nums">
      {hours > 0 && <RollingNumber key="hours" value={hours} suffix="h" />}
      {(hours === 0 || remainder > 0) && (
        <RollingNumber key="minutes" value={remainder} suffix="m" />
      )}
    </span>
  );
}
