// 黄金样本 G18-1（合成）：Recipes 单例里的全部配方与 FurnaceRecipes。
// 每个配方：类型（shaped/shapeless，经 dynamic_cast）、产物（id、数量、aux）、size()、getCraftingSize()、ItemPack（材料键 → 数量，按键有序）。
#include <cstdio>
#include <map>
#include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <list>
#include <set>
#include <cmath>
#include <cstring>
#include <cstdlib>
#include <memory>
#include <functional>
#define private public
#define protected public
#include "world/item/crafting/Recipe.h"
#include "world/item/crafting/Recipes.h"
#include "world/item/crafting/ShapedRecipe.h"
#include "world/item/crafting/ShapelessRecipe.h"
#include "world/item/crafting/FurnaceRecipes.h"
#undef private
#undef protected
#include "world/item/Item.h"
#include "world/level/tile/Tile.h"
#include "world/level/material/Material.h"
#include "util/Mth.h"

int main(int argc, char** argv) {
  Mth::initMth();
  Material::initMaterials();
  Tile::initTiles();
  Item::initItems();
  Recipes* r = Recipes::getInstance();
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"recipes\":[");
  const RecipeList& list = r->getRecipes();
  for (unsigned i = 0; i < list.size(); i++) {
    Recipe* rc = list[i];
    ItemInstance res = rc->getResultItem();
    const char* kind = dynamic_cast<ShapedRecipe*>(rc) ? "shaped" : dynamic_cast<ShapelessRecipe*>(rc) ? "shapeless" : "?";
    std::fprintf(o, "%s{\"kind\":\"%s\",\"result\":[%d,%d,%d],\"size\":%d,\"craftingSize\":%d,\"pack\":[", i ? "," : "", kind, res.id, res.count, res.getAuxValue(), rc->size(), rc->getCraftingSize());
    bool first = true;
    for (ItemPack::Map::const_iterator it = rc->myItems.items.begin(); it != rc->myItems.items.end(); ++it) {
      std::fprintf(o, "%s[%d,%d]", first ? "" : ",", it->first, it->second);
      first = false;
    }
    std::fprintf(o, "]}");
  }
  std::fprintf(o, "],\"furnace\":[");
  const FurnaceRecipes::Map& fm = FurnaceRecipes::getInstance()->getRecipes();
  bool first = true;
  for (FurnaceRecipes::Map::const_iterator it = fm.begin(); it != fm.end(); ++it) {
    std::fprintf(o, "%s[%d,%d,%d,%d]", first ? "" : ",", it->first, it->second.id, it->second.count, it->second.getAuxValue());
    first = false;
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
