/**
 * Purple → pink gradient for primary CTAs (New feature, Start Cursor).
 * Sidebar menu buttons need hover/active overrides so sidebar-accent does not cover the gradient.
 */
export const GRADIENT_CTA_BUTTON_CLASSES =
  "border-0 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 text-white shadow-sm transition-[filter,box-shadow] hover:brightness-110 hover:shadow-md focus-visible:ring-2 focus-visible:ring-pink-400/50 [&_svg]:text-white";

export const GRADIENT_CTA_SIDEBAR_MENU_EXTRA =
  "hover:!bg-gradient-to-r hover:!from-purple-600 hover:!via-fuchsia-500 hover:!to-pink-500 active:brightness-95 data-[active=true]:!bg-gradient-to-r data-[active=true]:!from-purple-600 data-[active=true]:!via-fuchsia-500 data-[active=true]:!to-pink-500 data-[active=true]:!text-white";
