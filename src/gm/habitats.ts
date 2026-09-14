import type { PokedexEntry } from '../data/types';

/* Where a species can be met.

   The Pokédex bundle carries no habitat at all — neither the built
   pokedex-db.js nor the raw v3.0 entries it is generated from — so the
   generator answers "a random cave Pokémon" from the table below: every one
   of the 1025 species placed by hand, by national dex number, in one or two
   of fourteen habitats. A species in two habitats is in two lists; it is not
   drawn any more often for it — a roll picks uniformly among the species that
   qualify, never a habitat first — and `.verify/generator-test.mjs` checks
   exactly that.

   Numbers rather than names, so that an alternate form inherits its base
   species' habitat unless `FORMS` says otherwise — and it says otherwise
   wherever the form's home is different: an Alolan Vulpix is on the snow,
   not in Kanto Vulpix's grassland. Megas never come up (the generator does
   not roll them). The type fallback at the bottom is only a safety net for a
   species the table does not know — a future dex addition — and the report
   `.verify/habitat-report.mjs` writes lists any that reach it.

   The full list, one line per species, is in `.verify/habitat-report.txt`
   after running that script; that is the thing to review, not this table. */

export interface Habitat {
    key: string;
    label: string;
    icon: string;
    /** Types that place a species here when the table does not know it. */
    types: string[];
}

export const HABITATS: Habitat[] = [
    { key: 'grassland', label: 'Grassland', icon: 'fa-seedling',
        types: ['Normal', 'Grass', 'Electric', 'Bug', 'Flying', 'Fairy'] },
    { key: 'forest', label: 'Forest & jungle', icon: 'fa-tree',
        types: ['Grass', 'Bug', 'Flying', 'Normal', 'Fairy', 'Dark', 'Psychic'] },
    { key: 'cave', label: 'Cave', icon: 'fa-dungeon',
        types: ['Rock', 'Ground', 'Dark', 'Steel', 'Poison', 'Dragon'] },
    { key: 'mountain', label: 'Mountain', icon: 'fa-mountain',
        types: ['Rock', 'Ground', 'Fighting', 'Flying', 'Fire', 'Dragon', 'Steel', 'Ice'] },
    { key: 'desert', label: 'Desert & badlands', icon: 'fa-sun',
        types: ['Ground', 'Rock', 'Fire', 'Steel'] },
    { key: 'river', label: 'Rivers & lakes', icon: 'fa-water',
        types: ['Water', 'Grass', 'Bug'] },
    { key: 'sea', label: 'Sea & beach', icon: 'fa-fish',
        types: ['Water', 'Ice'] },
    { key: 'swamp', label: 'Swamp & marsh', icon: 'fa-frog',
        types: ['Poison', 'Water', 'Grass', 'Bug'] },
    { key: 'snow', label: 'Snow & tundra', icon: 'fa-snowflake',
        types: ['Ice'] },
    { key: 'volcano', label: 'Volcano', icon: 'fa-fire',
        types: ['Fire'] },
    { key: 'urban', label: 'Urban', icon: 'fa-city',
        types: ['Normal', 'Poison', 'Electric', 'Psychic', 'Steel', 'Fairy', 'Fighting'] },
    { key: 'graveyard', label: 'Graveyard & haunted', icon: 'fa-skull',
        types: ['Ghost'] },
    { key: 'sky', label: 'Sky', icon: 'fa-cloud',
        types: ['Flying'] },
    { key: 'ruins', label: 'Ruins & temples', icon: 'fa-landmark',
        types: ['Psychic', 'Ghost', 'Rock', 'Steel'] },
];

/* One list per habitat, by national dex number; a species may be in two. */
const SPECIES: Record<string, number[]> = {
    grassland: [
        1, 2, 3, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 29, 30, 31, 32, 33, 34, 37, 38, 39, 40,
        43, 44, 45, 52, 53, 58, 59, 69, 70, 71, 77, 78, 83, 84, 85, 108, 113, 114, 115, 123,
        128, 132, 133, 135, 152, 153, 154, 161, 162, 165, 166, 174, 175, 176, 179, 180, 181,
        182, 187, 188, 189, 191, 192, 203, 206, 231, 232, 241, 242, 243, 255, 256, 261, 262,
        263, 264, 267, 276, 277, 280, 281, 282, 300, 301, 309, 310, 311, 312, 315, 316, 317,
        325, 326, 335, 336, 387, 388, 389, 396, 397, 398, 401, 402, 403, 404, 405, 406, 407,
        420, 421, 427, 428, 434, 435, 440, 463, 475, 492, 495, 496, 497, 498, 499, 504, 505,
        506, 507, 508, 519, 520, 521, 522, 523, 531, 546, 547, 548, 549, 572, 573, 585, 586,
        626, 653, 654, 655, 659, 660, 661, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673,
        700, 702, 725, 726, 734, 735, 741, 742, 743, 749, 750, 777, 795, 813, 814, 815, 819,
        820, 821, 822, 824, 825, 826, 827, 828, 829, 830, 831, 832, 835, 836, 865, 870, 877,
        906, 907, 908, 909, 910, 915, 916, 919, 920, 921, 922, 923, 924, 925, 928, 929, 930,
        951, 952, 955, 956, 967, 981, 982,
    ],
    forest: [
        1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 18, 25, 26, 29, 30, 31, 32, 33, 34, 43, 44, 45,
        46, 47, 48, 49, 56, 57, 69, 70, 71, 102, 103, 108, 114, 123, 127, 143, 151, 152, 153,
        154, 163, 164, 165, 166, 167, 168, 172, 177, 178, 182, 185, 190, 193, 196, 197, 198,
        204, 205, 212, 214, 216, 217, 234, 251, 252, 253, 254, 261, 262, 263, 264, 265, 266,
        267, 268, 269, 273, 274, 275, 285, 286, 287, 288, 289, 290, 291, 292, 313, 314, 315,
        327, 336, 352, 357, 387, 388, 389, 396, 397, 399, 400, 401, 402, 406, 407, 412, 413,
        414, 415, 416, 417, 420, 421, 424, 427, 428, 430, 438, 441, 446, 463, 465, 469, 470,
        488, 491, 492, 495, 496, 497, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 521,
        527, 528, 540, 541, 542, 543, 544, 545, 570, 571, 585, 586, 587, 588, 589, 590, 591,
        616, 617, 632, 640, 650, 651, 652, 653, 654, 655, 664, 665, 666, 674, 675, 682, 683,
        700, 701, 702, 708, 709, 710, 711, 716, 722, 723, 724, 731, 732, 733, 736, 737, 738,
        741, 742, 743, 753, 754, 755, 756, 759, 760, 761, 762, 763, 764, 765, 766, 775, 778,
        785, 786, 787, 794, 795, 798, 807, 810, 811, 812, 819, 820, 821, 824, 825, 826, 827,
        828, 840, 841, 842, 856, 857, 858, 859, 860, 861, 876, 888, 889, 893, 898, 899, 900,
        901, 906, 907, 908, 917, 918, 921, 922, 923, 944, 945, 948, 949, 986, 1001, 1010, 1011,
        1015, 1016, 1017, 1019,
    ],
    cave: [
        27, 28, 35, 36, 41, 42, 46, 47, 50, 51, 66, 67, 68, 74, 75, 76, 95, 104, 105, 124, 132,
        138, 139, 140, 141, 150, 169, 173, 202, 206, 207, 208, 213, 246, 247, 293, 294, 295,
        299, 302, 303, 304, 305, 306, 337, 338, 360, 361, 362, 371, 372, 374, 375, 376, 379,
        408, 409, 410, 411, 436, 437, 443, 444, 445, 472, 476, 480, 481, 482, 524, 525, 526,
        527, 528, 529, 530, 595, 596, 597, 598, 602, 603, 604, 610, 611, 612, 621, 624, 625,
        633, 634, 635, 638, 639, 646, 703, 707, 714, 715, 718, 719, 755, 756, 782, 783, 784,
        793, 799, 808, 809, 837, 838, 839, 863, 895, 932, 933, 934, 957, 958, 959, 968, 969,
        970, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997,
        998, 1003, 1005, 1006, 1007, 1008, 1009, 1010, 1020, 1021, 1022, 1023, 1024,
    ],
    mountain: [
        4, 5, 6, 35, 36, 56, 57, 58, 59, 66, 67, 68, 74, 75, 76, 77, 78, 95, 111, 112, 136, 142,
        143, 155, 156, 157, 173, 185, 207, 213, 215, 216, 217, 225, 227, 228, 229, 231, 232,
        246, 247, 248, 256, 257, 296, 297, 304, 305, 306, 307, 308, 324, 325, 326, 327, 333,
        334, 335, 358, 359, 371, 372, 373, 385, 390, 391, 392, 433, 438, 445, 447, 448, 459,
        460, 461, 462, 464, 472, 483, 499, 500, 538, 539, 566, 567, 610, 611, 612, 615, 619,
        620, 621, 627, 628, 629, 630, 632, 633, 634, 635, 636, 637, 639, 662, 663, 672, 673,
        701, 721, 740, 744, 745, 757, 758, 759, 760, 774, 777, 780, 782, 783, 784, 794, 799,
        823, 837, 838, 839, 863, 870, 874, 878, 879, 884, 891, 892, 900, 903, 950, 962, 979,
        995, 1014, 1017, 1018, 1022,
    ],
    desert: [
        21, 22, 23, 24, 27, 28, 50, 51, 84, 85, 111, 112, 115, 228, 229, 322, 323, 328, 329,
        330, 331, 332, 343, 344, 377, 443, 444, 445, 449, 450, 451, 452, 464, 551, 552, 553,
        554, 555, 556, 557, 558, 559, 560, 561, 605, 606, 629, 630, 631, 645, 667, 668, 694,
        695, 696, 697, 720, 744, 745, 749, 750, 843, 844, 850, 851, 878, 879, 932, 933, 934,
        946, 947, 950, 951, 952, 953, 954, 955, 956, 968, 984, 989,
    ],
    river: [
        7, 8, 9, 54, 55, 60, 61, 62, 79, 80, 83, 118, 119, 129, 130, 134, 147, 148, 158, 159,
        160, 183, 184, 186, 194, 195, 199, 245, 258, 259, 260, 270, 271, 272, 283, 284, 298,
        318, 319, 339, 340, 341, 342, 349, 350, 399, 400, 418, 419, 422, 423, 480, 481, 482,
        501, 502, 503, 515, 516, 535, 536, 537, 550, 580, 581, 618, 647, 656, 657, 658, 704,
        705, 706, 751, 752, 764, 816, 817, 818, 833, 834, 846, 847, 902, 904, 912, 913, 914,
        938, 939, 973, 1009,
    ],
    sea: [
        7, 8, 9, 72, 73, 79, 80, 86, 87, 90, 91, 98, 99, 116, 117, 120, 121, 129, 130, 131, 134,
        147, 148, 149, 170, 171, 199, 211, 222, 223, 224, 226, 230, 249, 278, 279, 318, 319,
        320, 321, 345, 346, 347, 348, 350, 363, 364, 365, 366, 367, 368, 369, 370, 380, 381,
        382, 393, 394, 395, 422, 423, 456, 457, 458, 484, 489, 490, 501, 502, 503, 564, 565,
        580, 581, 592, 593, 594, 602, 603, 604, 686, 687, 688, 689, 690, 691, 692, 693, 728,
        729, 730, 739, 746, 747, 748, 767, 768, 769, 770, 771, 779, 781, 788, 845, 846, 847,
        852, 853, 864, 871, 875, 885, 886, 887, 904, 940, 941, 960, 961, 963, 964, 973, 976,
        977, 978,
    ],
    swamp: [
        48, 49, 60, 61, 62, 88, 89, 158, 159, 160, 186, 193, 194, 195, 258, 259, 260, 270, 271,
        272, 283, 284, 313, 314, 316, 317, 339, 340, 451, 452, 453, 454, 455, 469, 535, 536,
        537, 543, 544, 545, 616, 617, 618, 656, 657, 658, 704, 705, 706, 901, 938, 939, 948,
        949, 980,
    ],
    snow: [
        86, 87, 124, 144, 215, 220, 221, 225, 234, 238, 361, 362, 363, 364, 365, 378, 393, 394,
        395, 459, 460, 461, 471, 473, 478, 486, 582, 583, 584, 613, 614, 615, 646, 698, 699,
        712, 713, 740, 866, 872, 873, 875, 896, 899, 974, 975, 991, 996, 997, 998, 1002,
    ],
    volcano: [
        4, 5, 6, 37, 38, 126, 136, 146, 155, 156, 157, 218, 219, 240, 244, 257, 322, 323, 324,
        383, 390, 391, 392, 467, 485, 500, 513, 514, 554, 555, 631, 636, 637, 643, 662, 663,
        721, 727, 757, 758, 776, 850, 851, 910, 911, 935, 936, 937, 988, 994, 1004, 1020,
    ],
    urban: [
        19, 20, 26, 39, 40, 52, 53, 63, 64, 65, 81, 82, 88, 89, 96, 97, 100, 101, 106, 107, 109,
        110, 113, 122, 125, 133, 135, 137, 145, 196, 197, 209, 210, 233, 235, 236, 237, 239,
        242, 280, 281, 282, 296, 297, 300, 301, 311, 312, 351, 353, 354, 412, 413, 414, 425,
        431, 432, 434, 435, 439, 440, 447, 448, 462, 466, 474, 475, 479, 494, 504, 505, 506,
        507, 508, 509, 510, 517, 518, 519, 520, 531, 532, 533, 534, 538, 539, 559, 560, 568,
        569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 582, 583, 584, 595, 596, 599,
        600, 601, 607, 608, 609, 624, 625, 648, 661, 676, 677, 678, 682, 683, 684, 685, 707,
        725, 726, 727, 734, 735, 736, 737, 738, 772, 773, 796, 801, 806, 808, 809, 813, 814,
        815, 835, 836, 848, 849, 854, 855, 859, 860, 861, 862, 866, 868, 869, 876, 877, 884,
        909, 915, 916, 924, 925, 926, 927, 931, 942, 943, 944, 945, 957, 958, 959, 965, 966,
        967, 983, 990, 992, 1000, 1006, 1012, 1013, 1018,
    ],
    graveyard: [
        92, 93, 94, 104, 105, 198, 200, 292, 302, 353, 354, 355, 356, 425, 426, 429, 430, 442,
        477, 478, 479, 487, 491, 562, 563, 607, 608, 609, 679, 680, 681, 708, 709, 710, 711,
        778, 781, 802, 806, 854, 855, 864, 867, 885, 886, 887, 897, 902, 911, 937, 946, 947,
        971, 972, 979, 987, 999, 1012, 1013, 1025,
    ],
    sky: [
        6, 18, 22, 142, 144, 145, 146, 149, 176, 188, 189, 226, 227, 249, 250, 276, 277, 279,
        330, 333, 334, 351, 357, 373, 380, 381, 384, 398, 426, 468, 472, 488, 493, 521, 561,
        581, 623, 627, 628, 630, 641, 642, 643, 644, 645, 662, 663, 666, 714, 715, 717, 774,
        780, 789, 790, 791, 792, 796, 797, 800, 804, 822, 823, 905, 940, 941, 962, 993, 1005,
        1021,
    ],
    ruins: [
        63, 64, 65, 138, 139, 140, 141, 142, 150, 151, 177, 178, 201, 299, 337, 338, 343, 344,
        345, 346, 347, 348, 358, 374, 375, 376, 377, 378, 379, 385, 386, 408, 409, 410, 411,
        433, 436, 437, 442, 476, 483, 484, 486, 487, 493, 494, 561, 562, 563, 564, 565, 566,
        567, 577, 578, 579, 605, 606, 622, 623, 649, 679, 680, 681, 696, 697, 698, 699, 720,
        772, 773, 785, 786, 787, 788, 791, 792, 793, 800, 801, 802, 803, 804, 805, 867, 874,
        880, 881, 882, 883, 890, 894, 895, 898, 936, 999, 1000, 1001, 1002, 1003, 1004, 1023,
        1024, 1025,
    ],
};

/* Alternate forms whose habitat is not their base species', by dex `_id`.
   A form absent from here goes by its number like the base form. */
const FORMS: Record<string, string[]> = {
    'rattata-alolan-form': ['urban'],
    'raticate-alolan-form': ['urban'],
    'raichu-alolan-form': ['urban', 'forest'],
    'sandshrew-alolan-form': ['snow', 'mountain'],
    'sandslash-alolan-form': ['snow', 'mountain'],
    'vulpix-alolan-form': ['snow', 'mountain'],
    'ninetales-alolan-form': ['snow', 'mountain'],
    'meowth-alolan-form': ['urban'],
    'meowth-galarian-form': ['mountain', 'urban'],
    'persian-alolan-form': ['urban'],
    'growlithe-hisuian-form': ['mountain', 'volcano'],
    'arcanine-hisuian-form': ['mountain', 'volcano'],
    'ponyta-galarian-form': ['forest'],
    'rapidash-galarian-form': ['forest'],
    'farfetchd-galarian-form': ['grassland', 'forest'],
    'grimer-alolan-form': ['urban'],
    'muk-alolan-form': ['urban'],
    'voltorb-hisuian-form': ['forest'],
    'electrode-hisuian-form': ['forest'],
    'exeggutor-alolan-form': ['sea', 'forest'],
    'marowak-alolan-form': ['graveyard', 'volcano'],
    'weezing-galarian-form': ['urban'],
    'mr-mime-galarian-form': ['snow'],
    'tauros-paldean-form-aqua-form': ['grassland', 'river'],
    'tauros-paldean-form-blaze-form': ['grassland', 'volcano'],
    'typhlosion-hisuian-form': ['volcano', 'graveyard'],
    'wooper-paldean-form': ['swamp'],
    'qwilfish-hisuian-form': ['sea'],
    'sneasel-hisuian-form': ['mountain'],
    'corsola-galarian-form': ['graveyard', 'sea'],
    'zigzagoon-galarian-form': ['urban', 'grassland'],
    'linoone-galarian-form': ['urban', 'grassland'],
    'lilligant-hisuian-form': ['mountain', 'snow'],
    'darumaka-galarian-form': ['snow'],
    'darmanitan-galarian-form': ['snow'],
    'darmanitan-galarian-zen-form': ['snow'],
    'zorua-hisuian-form': ['snow', 'graveyard'],
    'zoroark-hisuian-form': ['snow', 'graveyard'],
    'stunfisk-galarian-form': ['swamp', 'cave'],
    'braviary-hisuian-form': ['sky', 'snow'],
    'sliggoo-hisuian-form': ['mountain', 'cave'],
    'goodra-hisuian-form': ['mountain', 'cave'],
    'avalugg-hisuian-form': ['snow', 'mountain'],
    'decidueye-hisuian-form': ['forest', 'snow'],
    'ursaluna-kitakami-form': ['forest', 'mountain'],
    'shaymin-sky-form': ['grassland', 'forest', 'sky'],
};

/** number -> habitat keys, built once. */
const OF_NUMBER = new Map<number, string[]>();
Object.keys(SPECIES).forEach((key) => SPECIES[key].forEach((n) => {
    const list = OF_NUMBER.get(n) || [];
    list.push(key);
    OF_NUMBER.set(n, list);
}));

/** An alternate form — regional, Mega, Paldean and the rest — which the dex
    names "<Species> (<Something> Form)". */
export function isForm(p: PokedexEntry): boolean {
    return /\([^)]*Form\)/.test(p.Name || '');
}

export function habitatByKey(key: string): Habitat | null {
    return HABITATS.find((h) => h.key === key) || null;
}

/** Is this species in the table at all? False means the type fallback is
    answering for it, which the report flags. */
export function isPlaced(p: PokedexEntry): boolean {
    return !!FORMS[p._id] || OF_NUMBER.has(p.Number);
}

/** Every habitat key this species answers to. */
export function habitatsOf(p: PokedexEntry): string[] {
    const own = FORMS[p._id] || OF_NUMBER.get(p.Number);
    if (own) return own;
    return HABITATS
        .filter((h) => h.types.includes(p.Type1) || h.types.includes(p.Type2))
        .map((h) => h.key);
}

export function inHabitat(p: PokedexEntry, key: string): boolean {
    if (!habitatByKey(key)) return true;
    return habitatsOf(p).includes(key);
}
