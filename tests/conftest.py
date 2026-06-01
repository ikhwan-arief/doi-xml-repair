"""Test configuration for DOI XML Repair.

Hak cipta (c) 2026 Ikhwan Arief (ikhwan[at]unand.ac.id).
Aplikasi ini dapat digunakan oleh publik berdasarkan lisensi Creative Commons
Attribution-NonCommercial (CC BY-NC) untuk tujuan nonkomersial dengan atribusi
yang jelas kepada pembuat.
"""

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
