"use client";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** UK vs India on person-level counts. Validated pair (brand-derived; chroma floor waived → direct labels + legend). */
const UK = "#8e2a3b";
const IN = "#9a6b2c";

export function CountryChart({ data }: { data: Array<{ metric: string; UK: number; IN: number }> }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="UK versus India: organisations, qualified, reached, responded, meetings">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#d8d2ca" strokeDasharray="2 4" />
          <XAxis dataKey="metric" tick={{ fill: "#6b665f", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "#6b665f", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#e4dfd8" }} contentStyle={{ background: "#141414", border: 0, borderRadius: 12, color: "#f7f3ea", fontSize: 12 }} itemStyle={{ color: "#f7f3ea" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#3d3a36" }} />
          <Bar dataKey="UK" name="United Kingdom" fill={UK} radius={[4, 4, 0, 0]} maxBarSize={28}><LabelList dataKey="UK" position="top" fill="#3d3a36" fontSize={11} /></Bar>
          <Bar dataKey="IN" name="India" fill={IN} radius={[4, 4, 0, 0]} maxBarSize={28}><LabelList dataKey="IN" position="top" fill="#3d3a36" fontSize={11} /></Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
