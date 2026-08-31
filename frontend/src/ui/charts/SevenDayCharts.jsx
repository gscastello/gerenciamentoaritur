import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Carregado com React.lazy pelo Dashboard — assim o Recharts (pesado) sai
// do bundle inicial (ver manualChunks no vite.config.js). Paleta local
// para o arquivo não depender do objeto de tokens do App.jsx.
const C = {
  panel2: "#1C222B",
  border: "#262D38",
  borderSoft: "#1E252F",
  ink: "#ECEEF2",
  inkSoft: "#8B93A3",
  amber: "#E8A33D",
  blue: "#5B8DEF",
};

const brl = (n) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const cardStyle = { border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 };
const titleStyle = { fontSize: 14, fontWeight: 600, marginBottom: 12, color: C.ink };
const tooltipStyle = {
  background: C.panel2,
  borderColor: C.border,
  fontSize: 12,
  color: C.ink,
};

/**
 * @param {{ data: Array<{dia:string, faturamento:number, passageiros:number}> }} props
 */
export default function SevenDayCharts({ data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={cardStyle}>
        <div style={titleStyle}>Faturamento — últimos 7 dias</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid stroke={C.borderSoft} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: C.inkSoft }}
              axisLine={{ stroke: C.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: C.inkSoft }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip formatter={(v) => brl(v)} contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="faturamento"
              stroke={C.amber}
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>Passageiros por dia — últimos 7 dias</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid stroke={C.borderSoft} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: C.inkSoft }}
              axisLine={{ stroke: C.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: C.inkSoft }}
              axisLine={false}
              tickLine={false}
              width={30}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="passageiros" fill={C.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
