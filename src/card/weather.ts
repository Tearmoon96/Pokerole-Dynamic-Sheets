/* Weather, extreme weather and the optional environmental challenges.

   The strings are transcribed from the book as printed, typos and all ("ther",
   "Firer-type", "frigtening", "Semantary", "Disorted", "overriden"): it is rules
   text, not prose to tidy up. Lifted verbatim from the inline script. */

export interface WeatherEntry {
    key: string;
    name: string;
    /** The second line of the banner: flavour for a weather, a subtitle for
        an environment. */
    sub: string;
    color: string;
    icon: string;
    /** Where the weather is found; environments do not carry one. */
    where?: string;
    effects: string[];
    /** Extreme weathers override one another and cannot stack with the rest. */
    extreme?: boolean;
    /** Environments only: the short modifier chips under the effects. */
    mods?: string[];
}

export const WEATHER_CONDITIONS: WeatherEntry[] = [
    {
        key: 'sunny', name: 'Sunny Weather', color: '#8d7210', icon: 'fa-sun',
        sub: `A bright sunlight shines through the area. It's hot, you feel thirsty
            and tired.`,
        where: `This weather can naturally be found in plains, tropical areas and
            semi-desertic Regions. Wild Pok&eacute;mon will look for shade or a source
            of water to cool themselves.`,
        effects: [
            `All Fire-type moves add <strong>1 Extra Dice</strong> to their Damage Pools.`,
            `All Water-type moves get ther total damage reduced by <strong>1</strong>.`,
            `Cannot be active at night or in places where sunlight doesn't reach.`,
            `No one can be affected by the <strong>Frozen Solid</strong> Status Condition.
                Unless it was inflicted before Sunny Weather started.`,
            `Certain Moves &amp; Abilities interact with this type of weather.
                (ie. Solar Beam, Morning Sun, Chlorophyll, Solar Power etc.)`
        ]
    },
    {
        key: 'rain', name: 'Rain Weather', color: '#4a5aa8', icon: 'fa-cloud-showers-heavy',
        sub: `A heavy downpour. You are soaking wet. There's deep puddles and it is
            difficult to travel though.`,
        where: `This weather is common in rainforests, lakesides and marshes. Some wild
            Pok&eacute;mon will look for shelter while others enjoy rain in the open.`,
        effects: [
            `All Water-type moves have <strong>1 Extra Dice</strong> to their Damage Pools.`,
            `All Firer-type moves get ther total damage reduced by <strong>1</strong>.`,
            `Cannot be active indoors, or in places where the rain cannot reach.`,
            `No one can be affected by <strong>2nd</strong> or <strong>3rd Burn</strong>
                Status Condition. Unless it was inflicted before Rain Weather started.`,
            `Certain Moves &amp; Abilities interact with this type of weather.
                (ie. Thunder, Hurricane, Swift Swim)`
        ]
    },
    {
        key: 'snowy', name: 'Snowy Weather', color: '#17578f', icon: 'fa-snowman',
        sub: `Everything is covered in a thick layer of ice and snow with snowflakes
            falling all around you. It'd be beautiful if it wasn't so cold.`,
        where: `This weather is common in tall mountains artic Regions and during most of
            winter. Wild Ice-type Pok&eacute;mon thrive in this weather but most
            Pok&eacute;mon will seek warmth.`,
        effects: [
            `All Ice-type moves have <strong>1 Extra Dice</strong> to their Damage Pools.`,
            `Increase <strong>1 Point</strong> to the Defense of all Ice-type
                Pok&eacute;mon in the field.`,
            `Add <strong>1 Chance Die</strong> to all chance rolls to inflict
                <strong>Frozen Solid</strong> Status Condition.`,
            `Increase the HP and Defense of the ice block created by Frozen Solid to
                <strong>7HP</strong> and <strong>3 points of Def</strong>.`,
            `Certain Moves &amp; Abilities interact with this type of weather.`
        ]
    },
    {
        key: 'sandstorm', name: 'Sandstorm Weather', color: '#827450', icon: 'fa-wind',
        sub: `A dense brown cloud covers the area, it's made of sand and tiny rocks,
            visibility is poor and the sharp shards hurt your eyes and skin.`,
        where: `This weather is commonly seen in deserts and dunes. Rock, Ground and Steel
            Types barely pay any mind to it, but the rest of the Pok&eacute;mon will run
            towards their shelter.`,
        effects: [
            `All non Rock, Ground or Steel Type Pok&eacute;mon in the battlefield take
                <strong>1 typeless Damage</strong> at the end of the Round.`,
            `Full body cover prevents Sandstorm Damage.`,
            `Increase <strong>1 Point</strong> to the Special Defense of all Rock-type
                Pok&eacute;mon in the field.`,
            `Cannot be active indoors, or in places where the Sand cannot reach.`,
            `Certain Moves &amp; Abilities interact with this type of weather.`
        ]
    },
    {
        key: 'hail', name: 'Hail Weather', color: '#147e9f', icon: 'fa-snowflake',
        sub: `Rain and sharp and heavy ice balls are falling with enough force to dent a
            ceiling or crash a window, take refuge!`,
        where: `This weather can be found in plains, and at high altitudes during certain
            parts of the year. Almost every Pok&eacute;mon dislikes this weather as only
            Ice-types can resist it.`,
        effects: [
            `All non Ice-type Pok&eacute;mon in the battlefield take
                <strong>1 typeless Damage</strong> at the end of the Round.`,
            `Full body cover prevents Hail Damage.`,
            `Add <strong>1 Chance Die</strong> to all chance rolls to inflict
                <strong>Frozen Solid</strong> Status Condition.`,
            `Cannot be active indoors, or in places where the Hail cannot reach.`,
            `Certain Moves &amp; Abilities interact with this type of weather.`
        ]
    },
    {
        key: 'desolate', name: 'Desolate Weather', color: '#ba5b0c', icon: 'fa-sun-plant-wilt',
        extreme: true,
        sub: `Extreme heat all around and even lava. some objects just burst into flames.
            You will need special equipment to handle this weather.`,
        where: `This weather can only be found in completely arid deserts and volcanic
            areas. Only the most resilient wild Pok&eacute;mon can be found living in this
            very extreme weather.`,
        effects: [
            `All Fire-type moves add <strong>2 Extra Dice</strong> to their Damage Pools.`,
            `All Water-type Moves fail to be executed.`,
            `No other weather can be activated during Desolate Weather. Only Typhoon or
                Strong Winds weather may override it.`,
            `No one can be affected by the <strong>Frozen Solid</strong> Status Condition.`,
            `At the beginning of the Round, except for Fire-type Pok&eacute;mon, all with a
                Vitality Score of <strong>4</strong> or lower must make a Vitality check
                requiring <strong>2 successes</strong>. Taking
                <strong>2 Fire-type Damage</strong> upon failure.`
        ]
    },
    {
        key: 'typhoon', name: 'Typhoon Weather', color: '#1c4e9e', icon: 'fa-cloud-bolt',
        extreme: true,
        sub: `A great torrent quckly leaves everything underwater and you struggle to stay
            afloat trough the crashing waves around.`,
        where: `This weather can rarely be found in-land as it is more often seen closer to
            the sea. Only water-type Pok&eacute;mon are able to endure it, the rest are at
            risk of being washed off by the ocean.`,
        effects: [
            `All Water-type moves add <strong>2 Extra Dice</strong> to their Damage Pools.`,
            `All Fire-type Moves fail to be executed.`,
            `No other weather can be activated during Typhoon Weather. Only Desolate or
                Strong Winds weather may override it.`,
            `No one can be affected by <strong>Burn</strong> Status Condition at any degree.`,
            `At the beginning of the Round, except for Water-type Pok&eacute;mon, all with a
                Vitality Score of <strong>4</strong> or lower must make a Vitality check
                requiring <strong>2 successes</strong>. Taking
                <strong>2 Water-type Damage</strong> upon failure.`
        ]
    },
    {
        key: 'strongWinds', name: 'Strong Winds Weather', color: '#14313a', icon: 'fa-wind',
        extreme: true,
        sub: `Strong wind currents lift and swirl everything in the air. You are either
            being swept around or falling straight to the floor at great speed.`,
        where: `This weather can only be found at heights above 30,000 feet in the sky.
            Flying and floating Pok&eacute;mon can stay active in the air, but others may
            fall or bump into things.`,
        effects: [
            `All Flying-type Moves add <strong>2 Extra Dice</strong> to their Damage Pools.`,
            `Flying types do not receive Extra Damage from a Super-Effective Move.`,
            `No other weather can be activated during Strong Winds Weather. Once active, it
                cannot be overriden.`,
            `At the beginning of the Round, except for Flying-type Pok&eacute;mon and
                Pok&eacute;mon with the Levitate Ability, all with a Dexterity Score of
                <strong>4</strong> or lower must make a Dexterity check requiring
                <strong>2 successes</strong>. Taking <strong>2 Typeless Damage</strong>
                upon failure.`
        ]
    }
];

export const ENVIRONMENTS: WeatherEntry[] = [
    {
        key: 'underwater', name: 'Underwater', sub: 'Race Against Time',
        color: '#2269a3', icon: 'fa-water',
        effects: [`At the end of the Round, Non Water-type Pok&eacute;mon &amp; Trainers
            roll <strong>Vitality</strong> to hold their breath, difficulty increases by
            <strong>2</strong> each Round. Those affected faint upon failure.`]
    },
    {
        key: 'fog', name: 'Fog/Darkness', sub: 'Reduced Visibility',
        color: '#6b6b6b', icon: 'fa-smog',
        effects: [`All Pok&eacute;mon in get extra <strong>Low Accuracy 1</strong> on all
            their Moves targeting Foes.`]
    },
    {
        key: 'onFire', name: 'On Fire!', sub: 'Dangerous Hazards',
        color: '#d1421f', icon: 'fa-fire',
        effects: [`At the end of each Round, Roll <strong>3 Chance Dice</strong> to inflict
            <strong>2nd Degree Burn</strong> to everyone in the field.`]
    },
    {
        key: 'muddy', name: 'Muddy', sub: 'Difficult Terrain',
        color: '#8f4a49', icon: 'fa-shoe-prints',
        effects: [
            `All Pok&eacute;mon on the ground have their Dexterity reduced by
                <strong>1</strong>.`,
            `Pok&eacute;mon on the ground are <strong>Blocked</strong>.`
        ]
    },
    {
        key: 'electricPoles', name: 'Electric Poles', sub: 'Type-Boosting Elements',
        color: '#8a7500', icon: 'fa-bolt',
        effects: [`All Pok&eacute;mon will add <strong>1 Extra Die</strong> to the damage
            pool of Electric Type moves.`]
    },
    {
        key: 'flowers', name: 'Lovely Flowers', sub: 'Relaxing Effects',
        color: '#a8567f', icon: 'fa-spa',
        effects: [`The battlefield is a flower field that gives out a delicious aroma but
            also preventing evasion but also reducing aggression.`],
        mods: ['Damage -1', 'Damage -2', 'No Evasion']
    },
    {
        key: 'cemetery', name: 'Pkmn Semantary', sub: 'Frightening Environment',
        color: '#4a5aa8', icon: 'fa-ghost',
        effects: [`The battlefield is a frigtening place. Add <strong>2 Extra dice</strong>
            to all rolls involving the Intimidate Skill. Non Ghost-Type Pok&eacute;mon get
            the ability &ldquo;Run Away&rdquo;.`]
    },
    {
        key: 'sewer', name: 'Sewer/Dumpster', sub: 'Unsanitary Conditions',
        color: '#7b4f9d', icon: 'fa-dumpster',
        effects: [`The battlefield is knee-deep in filth. At the end of each Round roll
            <strong>3 dice</strong> to inflict <strong>Poison</strong> to everyone in the
            field.`]
    },
    {
        key: 'minefield', name: 'Minefield', sub: 'Hidden traps',
        color: '#8a5a2b', icon: 'fa-bomb',
        effects: [`Watch your step. All Pok&eacute;mon entering the field take
            <strong>1 typeless damage</strong>.`]
    },
    {
        key: 'jungle', name: 'Deep in the Jungle', sub: 'Added Camouflage',
        color: '#3a8444', icon: 'fa-tree',
        effects: [`A lush foliage covers the battlefield. Add <strong>2 Extra dice</strong>
            to all rolls involving the Stealth and Nature Skills.`]
    },
    {
        key: 'healingPits', name: 'Healing Pits', sub: 'HP Restoring Sources',
        color: '#dc2a70', icon: 'fa-heart-circle-plus',
        effects: [`There are areas in the field that restore HP to those who spend their
            action to touch them. The area is depleted afterwards.`],
        mods: ['Heal 1']
    },
    {
        key: 'highPoles', name: 'High Poles', sub: 'Risk of Falling',
        color: '#4d7590', icon: 'fa-tower-observation',
        effects: [`At the end of the Round, Non Flying-Type Pok&eacute;mon roll
            <strong>Dexterity + Athletic</strong> to keep their balance. Taking
            <strong>2 damage</strong> on a fail.`]
    },
    {
        key: 'tornWorld', name: 'Torn World', sub: 'Disorted Space',
        color: '#4a4a5c', icon: 'fa-shuffle',
        effects: [`The laws of physics have abandoned the battlefield. All Moves get their
            Target changed at random.`]
    },
    {
        key: 'sprinklers', name: 'Sprinklers', sub: 'Type-Changing Effects',
        color: '#0f7f86', icon: 'fa-shower',
        effects: [`Everyone on the battlefield gets soaking wet by active sprinklers. Their
            Type is changed to Water. Whole Scene Duration.`]
    },
    {
        key: 'finalDestination', name: 'Final Destination', sub: 'Power Test',
        color: '#b3419c', icon: 'fa-star',
        effects: [`No items. No Evasion. No Clash. Raw power only.`]
    }
];


export const WEATHER_TABS = [
    { key: 'weather', label: 'Weather' },
    { key: 'extreme', label: 'Extreme Weather' },
    { key: 'env', label: 'Environments' }
];

export const ENV_INTRO = `You can add an extra layer of challenge into your battles if you take the
    environment into account. You don't have to use them all the time, but Official League
    Tournaments usually give each match one or two added Challenges.`;
