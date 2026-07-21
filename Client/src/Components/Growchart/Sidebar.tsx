import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGrowchart } from "./GrowchartContext";

type SidebarProps = {
  onWidthChange?: (width: number) => void;
};

type MenuItem = {
  label: string;
  icon: string;
  path?: string;
  disabled?: boolean;
  submenu?: { label: string; path: string }[];
};

export default function Sidebar({ onWidthChange }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { patient } = useGrowchart();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  const sidebarWidth = collapsed ? 64 : 260;

  useEffect(() => {
    if (onWidthChange) {
      onWidthChange(sidebarWidth);
    }
  }, [sidebarWidth, onWidthChange]);

  const menuItems: MenuItem[] = [
    {
      label: "Patients Directory",
      icon: "👥",
      path: "/patients",
    },
    {
      label: "Fenton Chart",
      icon: "📈",
      submenu: [
        { label: "View Chart", path: "/" },
        patient ? { label: "Edit Patient", path: "/edit-patient" } : { label: "Add Patient", path: "/add-patient" },
      ],
    },
    {
      label: "WHO Chart",
      icon: "📊",
      disabled: !patient,
      submenu: patient ? [
        { label: "View Chart", path: "/detail" },
        { label: "Edit Patient", path: "/edit-patient" },
      ] : undefined,
    },
    {
      label: "TDSC Chart",
      icon: "📉",
      path: "/TDSC3yrs",
    },
  ];

  const toggleSubmenu = (label: string) => {
    if (collapsed) return;
    setExpandedMenu(expandedMenu === label ? null : label);
  };

  return (
    <div style={{ ...s.sidebar, width: `${sidebarWidth}px` }}>
      <div style={s.header}>
        <div style={s.brand} onClick={() => navigate("/")}>
          <span style={s.brandIcon}>📈</span>
          {!collapsed && <span style={s.brandName}>CliniGrowth</span>}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={s.toggleBtn}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            style={{
              transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.3s",
            }}
          >
            <path
              d="M13 8L7 14L13 20"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div style={s.menu}>
        {menuItems.map((item) => {
          const hasSubmenu = item.submenu && item.submenu.length > 0;
          const isExpanded = expandedMenu === item.label;
          const disabled = item.disabled;
          const isActive = item.path ? location.pathname === item.path : false;

          return (
            <div key={item.label}>
              <button
                onClick={() => {
                  if (disabled) return;
                  if (hasSubmenu) {
                    toggleSubmenu(item.label);
                  } else if (item.path) {
                    navigate(item.path);
                  }
                }}
                style={{
                  ...s.menuItem,
                  ...(isActive ? s.menuItemActive : {}),
                  ...(disabled ? s.menuItemDisabled : {}),
                }}
                title={disabled ? "Plot a chart first to access this page" : item.label}
              >
                <span style={s.menuIcon}>{item.icon}</span>
                {!collapsed && <span style={s.menuLabel}>{item.label}</span>}
                {!collapsed && hasSubmenu && (
                  <span style={{ ...s.expandIcon, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                    ▶
                  </span>
                )}
              </button>

              {!collapsed && hasSubmenu && isExpanded && (
                <div style={s.submenu}>
                  {item.submenu!.map((subItem) => {
                    const active = location.pathname === subItem.path;
                    return (
                      <button
                        key={subItem.path}
                        onClick={() => navigate(subItem.path)}
                        style={{
                          ...s.submenuItem,
                          ...(active ? s.submenuItemActive : {}),
                        }}
                      >
                        <span style={s.submenuLabel}>{subItem.label}</span>
                        {active && <span style={s.activeIndicator} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Patient info at bottom */}
      {patient?.patientName && (
        <div style={s.patientSection}>
          <div style={s.patientInfo}>
            <span
              style={{
                fontSize: collapsed ? 18 : 14,
                color: patient.gender === "male" ? "#3b82f6" : patient.gender === "female" ? "#ec4899" : "#64748b",
              }}
            >
              {patient.gender === "male" ? "♂" : patient.gender === "female" ? "♀" : ""}
            </span>
            {!collapsed && (
              <>
                <span style={s.patientName}>{patient.patientName}</span>
                {patient.gaAtBirth && (
                  <span style={s.patientGA}>GA {patient.gaAtBirth}w</span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    position: "fixed",
    left: 0,
    top: 0,
    height: "100vh",
    width: "260px",
    backgroundColor: "#1e293b",
    display: "flex",
    flexDirection: "column",
    boxShadow: "2px 0 8px rgba(0,0,0,0.15)",
    zIndex: 1000,
    transition: "width 0.3s ease",
    fontFamily: "'Segoe UI', sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    flex: 1,
  },
  brandIcon: { fontSize: 20 },
  brandName: { fontSize: 16, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.3px" },
  toggleBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  },
  menu: {
    flex: 1,
    padding: "12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left",
    position: "relative",
  },
  menuItemActive: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#f8fafc",
    fontWeight: 600,
  },
  menuItemDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  menuIcon: { fontSize: 18, flexShrink: 0 },
  menuLabel: { flex: 1 },
  expandIcon: {
    fontSize: 10,
    color: "#64748b",
    transition: "transform 0.2s",
  },
  submenu: {
    paddingLeft: 36,
    marginTop: 4,
    marginBottom: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  submenuItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left",
    position: "relative",
  },
  submenuItemActive: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    color: "#3b82f6",
    fontWeight: 600,
  },
  submenuLabel: { flex: 1 },
  activeIndicator: {
    position: "absolute",
    right: 8,
    width: 4,
    height: 4,
    borderRadius: "50%",
    backgroundColor: "#3b82f6",
  },
  patientSection: {
    padding: "16px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
  },
  patientInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "12px",
  },
  patientName: { fontSize: 13, fontWeight: 700, color: "#f1f5f9" },
  patientGA: { fontSize: 11, color: "#94a3b8" },
};
