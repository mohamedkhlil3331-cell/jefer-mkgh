import type { ReactNode } from "react";

type CargoPhotoUploadGateProps = {
  showCargoPhoto?: boolean | number | null;
  children: ReactNode;
};

/**
 * Keeps the cargo-photo card visible for legacy vehicles unless fleet settings
 * explicitly disable it (false or 0).
 */
export default function CargoPhotoUploadGate({ showCargoPhoto, children }: CargoPhotoUploadGateProps) {
  return showCargoPhoto === false || showCargoPhoto === 0 ? null : <>{children}</>;
}