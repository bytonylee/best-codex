#!/usr/bin/env python3
"""Legacy compatibility wrapper. Prefer validate_sheet.py for new workflows."""

from __future__ import annotations

from validate_sheet_impl import main


if __name__ == "__main__":
    main()
